import { cache } from "react";
import {
  readThroughCache,
  REDIS_CACHE_KEYS
} from "@/lib/cache-redis";
import { emptyHomepageCmsContent, type HomepageCmsContent } from "@/config/homepage-cms";
import { defaultHomepageCmsV2Content, type HomepageCmsV2Content } from "@/config/homepage-cms-v2";
import type { HeroSlide, Product } from "@/config/types";
import type { CustomerProductReview } from "@/services/customer-product-reviews";
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
import { getHomepageCmsContent, getHomepageCmsDraftPreviewContent } from "@/services/homepage-cms";
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

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
  if (result.status === "fulfilled") return result.value;
  const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
  console.warn(`[homepage-bundle] ${label} failed: ${message}`);
  return fallback;
}

function mergeProductsBySlug(primary: Product[], extra: Product[]) {
  const bySlug = new Map<string, Product>();
  for (const product of primary) bySlug.set(product.slug, product);
  for (const product of extra) {
    if (!bySlug.has(product.slug)) bySlug.set(product.slug, product);
  }
  return [...bySlug.values()];
}

/**
 * Homepage cold-miss regeneration. Coalescing / stampede protection lives in
 * `readThroughCache` → `withSingleFlight` (lock + heartbeat + fallback elect).
 * Do not nest a second lock/fallback here — that previously multiplied loaders.
 */
export const getHomepageBundle = cache(async (cmsDraftPreview = false): Promise<HomepageBundle> => {
  if (cmsDraftPreview) {
    return loadHomepageBundleUncached(true);
  }
  return readThroughCache(REDIS_CACHE_KEYS.cmsHomepage, 60, () => loadHomepageBundleUncached(false));
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
    getPublicCmsSnapshotForHomepageBelowFold(),
    getHomepageProducts(),
    cmsDraftPreview ? getHomepageCmsDraftPreviewContent() : getHomepageCmsContent(),
    cmsDraftPreview ? getHomepageCmsV2DraftPreviewContent() : getHomepageCmsV2Content(),
    listPublishedBlogPosts({ limit: 40 }),
    listPublishedPressCoverage({ limit: 40 })
  ]);

  const cms = settledValue(cmsResult, fallbackSnapshot, "CMS snapshot");
  const shelfProducts = settledValue(productsResult, [] as Product[], "homepage products");
  const homepageCms = settledValue(homepageCmsResult, emptyHomepageCmsContent, "homepage CMS");
  const homepageCmsV2 = settledValue(homepageCmsV2Result, defaultHomepageCmsV2Content, "homepage CMS v2");
  const relatedArticles = settledValue(relatedArticlesResult, [] as BlogPost[], "blog posts");
  const pressCoverage = settledValue(pressCoverageResult, [] as PressCoverageItem[], "press coverage");

  const testimonialSlugs = [
    ...new Set(
      (homepageCmsV2.testimonialCards ?? [])
        .map((card) => card.productSlug)
        .filter((slug): slug is string => Boolean(slug?.trim()))
    )
  ];
  const shelfSlugSet = new Set(shelfProducts.map((product) => product.slug));
  const missingTestimonialSlugs = testimonialSlugs.filter((slug) => !shelfSlugSet.has(slug));
  const fetchedTestimonialProducts = missingTestimonialSlugs.length
    ? await getPublishedProductsBySlugs(missingTestimonialSlugs).catch((error) => {
        console.warn(
          `[homepage-bundle] testimonial products failed: ${error instanceof Error ? error.message : String(error)}`
        );
        return [] as Product[];
      })
    : [];
  const products = mergeProductsBySlug(shelfProducts, fetchedTestimonialProducts);

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
