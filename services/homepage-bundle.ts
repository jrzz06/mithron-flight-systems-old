import { cache } from "react";
import {
  HOMEPAGE_SINGLE_FLIGHT_LOADER_TIMEOUT_MS,
  readThroughCache,
  REDIS_CACHE_KEYS
} from "@/lib/cache-redis";
import type { HomepageCmsContent } from "@/config/homepage-cms";
import { defaultHomepageCmsV2Content, type HomepageCmsV2Content } from "@/config/homepage-cms-v2";
import type { HeroSlide, Product } from "@/config/types";
import type { CustomerProductReview } from "@/services/customer-product-reviews";
import { ActionTimeoutError, raceWithTimeout } from "@/lib/fetch-with-timeout";
import { listPublishedBlogPosts, type BlogPost } from "@/services/blog-posts";
import { listPublishedPressCoverage, type PressCoverageItem } from "@/services/press-coverage";
import { getHomepageProducts, getPublishedProductsBySlugs } from "@/services/catalog";
import {
  fallbackSnapshot,
  getPublicCmsSnapshotForHomepageBelowFold,
  getPublicHeroBanners,
  getPublicHeroBannersForCmsPreview,
  type PublicCmsSnapshot
} from "@/services/cms";
import { getHomepageCmsContent, getHomepageCmsDraftPreviewContent, mergeHomepageCmsContent } from "@/services/homepage-cms";
import { getHomepageCmsV2Content, getHomepageCmsV2DraftPreviewContent } from "@/services/homepage-cms-v2";

export type HomepageBundle = {
  heroBanners: HeroSlide[];
  cms: PublicCmsSnapshot;
  products: Product[];
  homepageCms: HomepageCmsContent;
  homepageCmsV2: HomepageCmsV2Content;
  relatedArticles: BlogPost[];
  pressCoverage: PressCoverageItem[];
  customerReviews: CustomerProductReview[];
};

export type HomepageBelowFoldData = Omit<HomepageBundle, "heroBanners">;

/**
 * Cap each parallel dependency so one hung Supabase/Redis nested single-flight
 * cannot stall `Promise.allSettled` past the outer homepage budget.
 * Products + CMS are critical for shelves/banners — give them most of the 25s wall.
 */
const HOMEPAGE_CHILD_TIMEOUT_MS = 8_000;
/** Critical path must finish inside the 25s single-flight wall — keep headroom. */
const HOMEPAGE_CRITICAL_CHILD_TIMEOUT_MS = 12_000;
const HOMEPAGE_TESTIMONIAL_PRODUCTS_TIMEOUT_MS = 6_000;
const HOMEPAGE_PINNED_PRODUCTS_TIMEOUT_MS = 6_000;

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
  if (result.status === "fulfilled") return result.value;
  const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
  console.warn(`[homepage-bundle] ${label} failed: ${message}`);
  return fallback;
}

function mergeProductsBySlug(primary: Product[], ...extras: Product[][]) {
  const bySlug = new Map<string, Product>();
  for (const product of primary) bySlug.set(product.slug, product);
  for (const extra of extras) {
    for (const product of extra) {
      if (!bySlug.has(product.slug)) bySlug.set(product.slug, product);
    }
  }
  return [...bySlug.values()];
}

function collectPinnedShelfSlugs(homepageCms: HomepageCmsContent): string[] {
  const shelves = homepageCms.shelves;
  return [
    ...new Set(
      [
        ...(shelves.droneWorld?.productSlugs ?? []),
        ...(shelves.droneCare?.productSlugs ?? []),
        ...(shelves.globalProducts?.productSlugs ?? [])
      ]
        .map((slug) => slug.trim())
        .filter(Boolean)
    )
  ];
}

function collectMiniCarouselSlugs(homepageCmsV2: HomepageCmsV2Content): string[] {
  return [
    ...new Set(
      (homepageCmsV2.miniCarousel?.slides ?? [])
        .filter((slide) => slide.enabled !== false)
        .map((slide) => slide.productSlug?.trim() ?? "")
        .filter(Boolean)
    )
  ];
}

function hasUsableInterShelfBanner(homepageCmsV2: HomepageCmsV2Content) {
  return (homepageCmsV2.banners?.interShelf ?? []).some(
    (banner) => banner?.enabled !== false && Boolean(banner?.imageSrc?.trim())
  );
}

function isHealthyHomepageBundle(bundle: HomepageBundle) {
  // Incomplete payloads must not poison Redis — next request should retry cold load.
  if (bundle.products.length === 0) return false;
  return true;
}

function emptyHomepageBundle(): HomepageBundle {
  return {
    heroBanners: [],
    cms: fallbackSnapshot,
    products: [],
    homepageCms: mergeHomepageCmsContent({}),
    homepageCmsV2: defaultHomepageCmsV2Content,
    relatedArticles: [],
    pressCoverage: [],
    customerReviews: []
  };
}

function withChildBudget<T>(promise: Promise<T>, label: string, timeoutMs = HOMEPAGE_CHILD_TIMEOUT_MS) {
  return raceWithTimeout(promise, timeoutMs, `homepage-bundle:${label}`);
}

/**
 * Homepage cold-miss regeneration. Coalescing / stampede protection lives in
 * `readThroughCache` → `withSingleFlight` (lock + heartbeat + fallback elect).
 * Do not nest a second lock/fallback here — that previously multiplied loaders.
 */
export const getHomepageBundle = cache(async (cmsDraftPreview = false): Promise<HomepageBundle> => {
  try {
    if (cmsDraftPreview) {
      return await loadHomepageBundleUncached(true);
    }
    return await readThroughCache(
      REDIS_CACHE_KEYS.cmsHomepage,
      60,
      () => loadHomepageBundleUncached(false),
      {
        loaderTimeoutMs: HOMEPAGE_SINGLE_FLIGHT_LOADER_TIMEOUT_MS,
        shouldCache: (value) => isHealthyHomepageBundle(value as HomepageBundle),
        isCacheValid: (value) => isHealthyHomepageBundle(value as HomepageBundle)
      }
    );
  } catch (error) {
    // Prefer a degraded homepage over a hard SSR failure when Redis/Supabase
    // cold paths exceed the single-flight wall clock. Do NOT retry here — a
    // second uncached load can hang Suspense for another full child budget.
    if (error instanceof ActionTimeoutError) {
      console.warn(`[homepage-bundle] ${error.message}`);
      return emptyHomepageBundle();
    }
    throw error;
  }
});

/** Hero-only loader so Suspense can resolve independently of the below-fold bundle. */
export const getHomepageHeroBanners = cache(async (cmsDraftPreview = false): Promise<HeroSlide[]> => {
  return cmsDraftPreview ? getPublicHeroBannersForCmsPreview() : getPublicHeroBanners();
});

/** Below-fold homepage data (shares getHomepageBundle / Redis cache). */
export const getHomepageBelowFoldData = cache(async (cmsDraftPreview = false): Promise<HomepageBelowFoldData> => {
  const bundle = await getHomepageBundle(cmsDraftPreview);
  const { heroBanners: _heroBanners, ...rest } = bundle;
  return rest;
});

async function loadHomepageBundleUncached(cmsDraftPreview = false): Promise<HomepageBundle> {
  const [
    cmsResult,
    productsResult,
    homepageCmsResult,
    homepageCmsV2Result,
    relatedArticlesResult,
    pressCoverageResult
  ] = await Promise.allSettled([
    withChildBudget(getPublicCmsSnapshotForHomepageBelowFold(), "CMS snapshot"),
    withChildBudget(getHomepageProducts(), "homepage products", HOMEPAGE_CRITICAL_CHILD_TIMEOUT_MS),
    withChildBudget(
      cmsDraftPreview ? getHomepageCmsDraftPreviewContent() : getHomepageCmsContent(),
      "homepage CMS",
      HOMEPAGE_CRITICAL_CHILD_TIMEOUT_MS
    ),
    withChildBudget(
      cmsDraftPreview ? getHomepageCmsV2DraftPreviewContent() : getHomepageCmsV2Content(),
      "homepage CMS v2",
      HOMEPAGE_CRITICAL_CHILD_TIMEOUT_MS
    ),
    withChildBudget(listPublishedBlogPosts({ limit: 12 }), "blog posts"),
    withChildBudget(listPublishedPressCoverage({ limit: 12 }), "press coverage")
  ]);

  const cms = settledValue(cmsResult, fallbackSnapshot, "CMS snapshot");
  const shelfProducts = settledValue(productsResult, [] as Product[], "homepage products");
  // Prefer merged defaults (same as homepage-cms service) over empty shells so
  // shelf titles/hrefs remain usable when the CMS child times out.
  const homepageCms = settledValue(homepageCmsResult, mergeHomepageCmsContent({}), "homepage CMS");
  const homepageCmsV2 = settledValue(homepageCmsV2Result, defaultHomepageCmsV2Content, "homepage CMS v2");
  const relatedArticles = settledValue(relatedArticlesResult, [] as BlogPost[], "blog posts");
  const pressCoverage = settledValue(pressCoverageResult, [] as PressCoverageItem[], "press coverage");

  if (shelfProducts.length === 0) {
    console.warn("[homepage-bundle] homepage products empty after settle — shelves will backfill from pinned slug fetch when possible");
  }
  if (!hasUsableInterShelfBanner(homepageCmsV2)) {
    console.warn("[homepage-bundle] CMS v2 has no usable inter-shelf banner images");
  }

  const shelfSlugSet = new Set(shelfProducts.map((product) => product.slug));
  const pinnedShelfSlugs = collectPinnedShelfSlugs(homepageCms);
  const miniCarouselSlugs = collectMiniCarouselSlugs(homepageCmsV2);
  const missingPinnedSlugs = [...new Set([...pinnedShelfSlugs, ...miniCarouselSlugs])].filter(
    (slug) => !shelfSlugSet.has(slug)
  );
  const fetchedPinnedProducts = missingPinnedSlugs.length
    ? await withChildBudget(
        getPublishedProductsBySlugs(missingPinnedSlugs),
        "pinned shelf products",
        HOMEPAGE_PINNED_PRODUCTS_TIMEOUT_MS
      ).catch((error) => {
        console.warn(
          `[homepage-bundle] pinned shelf products failed: ${error instanceof Error ? error.message : String(error)}`
        );
        return [] as Product[];
      })
    : [];

  const productsAfterPins = mergeProductsBySlug(shelfProducts, fetchedPinnedProducts);
  const productSlugSet = new Set(productsAfterPins.map((product) => product.slug));

  const testimonialSlugs = [
    ...new Set(
      (homepageCmsV2.testimonialCards ?? [])
        .map((card) => card.productSlug)
        .filter((slug): slug is string => Boolean(slug?.trim()))
    )
  ];
  const missingTestimonialSlugs = testimonialSlugs.filter((slug) => !productSlugSet.has(slug));
  const fetchedTestimonialProducts = missingTestimonialSlugs.length
    ? await withChildBudget(
        getPublishedProductsBySlugs(missingTestimonialSlugs),
        "testimonial products",
        HOMEPAGE_TESTIMONIAL_PRODUCTS_TIMEOUT_MS
      ).catch((error) => {
        console.warn(
          `[homepage-bundle] testimonial products failed: ${error instanceof Error ? error.message : String(error)}`
        );
        return [] as Product[];
      })
    : [];
  const products = mergeProductsBySlug(productsAfterPins, fetchedTestimonialProducts);

  return {
    // Hero is loaded by getHomepageHeroBanners / Suspense — do not duplicate here.
    heroBanners: [],
    cms,
    products,
    homepageCms,
    homepageCmsV2,
    relatedArticles,
    pressCoverage,
    customerReviews: []
  };
}
