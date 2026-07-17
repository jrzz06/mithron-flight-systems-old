import { cache } from "react";
import {
  acquireRedisLock,
  getCachedJson,
  readThroughCache,
  REDIS_CACHE_KEYS,
  releaseRedisLock,
  setCachedJson
} from "@/lib/cache-redis";
import { emptyHomepageCmsContent, type HomepageCmsContent } from "@/config/homepage-cms";
import { defaultHomepageCmsV2Content, type HomepageCmsV2Content } from "@/config/homepage-cms-v2";
import type { HeroSlide, Product } from "@/config/types";
import { listFeaturedHomeReviews, type CustomerProductReview } from "@/services/customer-product-reviews";
import { listPublishedBlogPosts, type BlogPost } from "@/services/blog-posts";
import { listPublishedPressCoverage, type PressCoverageItem } from "@/services/press-coverage";
import { getHomepageProducts, getPublishedProductsBySlugs } from "@/services/catalog";
import { fallbackSnapshot, getPublicCmsSnapshot, type PublicCmsSnapshot } from "@/services/cms";
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

const HOMEPAGE_BUNDLE_LOCK_KEY = "lock:cms:homepage:v1";
const HOMEPAGE_BUNDLE_LOCK_TTL_SECONDS = 8;
const HOMEPAGE_BUNDLE_WAIT_BUDGET_MS = 6_000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
 * Redis-backed single-flight: only one instance regenerates the homepage bundle
 * on a cold cache miss. Waiters poll the cache briefly instead of re-running the
 * 7-way Supabase fan-out. If Redis is unavailable, acquireRedisLock fails open
 * and every caller loads independently (same as before).
 */
async function loadHomepageBundleSingleFlight(): Promise<HomepageBundle> {
  const gotLock = await acquireRedisLock(HOMEPAGE_BUNDLE_LOCK_KEY, HOMEPAGE_BUNDLE_LOCK_TTL_SECONDS);
  if (gotLock) {
    try {
      const value = await loadHomepageBundleUncached(false);
      await setCachedJson(REDIS_CACHE_KEYS.cmsHomepage, value, 60);
      return value;
    } finally {
      await releaseRedisLock(HOMEPAGE_BUNDLE_LOCK_KEY);
    }
  }

  const deadlineAt = Date.now() + HOMEPAGE_BUNDLE_WAIT_BUDGET_MS;
  while (Date.now() < deadlineAt) {
    const cached = await getCachedJson<HomepageBundle>(REDIS_CACHE_KEYS.cmsHomepage);
    if (cached) return cached;
    await wait(150 + Math.random() * 150);
  }

  // Lock holder is taking too long — load directly rather than block forever.
  return loadHomepageBundleUncached(false);
}

export const getHomepageBundle = cache(async (cmsDraftPreview = false): Promise<HomepageBundle> => {
  if (cmsDraftPreview) {
    return loadHomepageBundleUncached(true);
  }
  return readThroughCache(REDIS_CACHE_KEYS.cmsHomepage, 60, loadHomepageBundleSingleFlight);
});

async function loadHomepageBundleUncached(cmsDraftPreview = false): Promise<HomepageBundle> {
  const [
    cmsResult,
    productsResult,
    homepageCmsResult,
    homepageCmsV2Result,
    relatedArticlesResult,
    pressCoverageResult,
    customerReviewsResult
  ] = await Promise.allSettled([
    getPublicCmsSnapshot(),
    getHomepageProducts(),
    cmsDraftPreview ? getHomepageCmsDraftPreviewContent() : getHomepageCmsContent(),
    cmsDraftPreview ? getHomepageCmsV2DraftPreviewContent() : getHomepageCmsV2Content(),
    listPublishedBlogPosts({ limit: 3 }),
    listPublishedPressCoverage({ limit: 3 }),
    listFeaturedHomeReviews({ limit: 6 })
  ]);

  const cms = settledValue(cmsResult, fallbackSnapshot, "CMS snapshot");
  const shelfProducts = settledValue(productsResult, [] as Product[], "homepage products");
  const homepageCms = settledValue(homepageCmsResult, emptyHomepageCmsContent, "homepage CMS");
  const homepageCmsV2 = settledValue(homepageCmsV2Result, defaultHomepageCmsV2Content, "homepage CMS v2");
  const relatedArticles = settledValue(relatedArticlesResult, [] as BlogPost[], "blog posts");
  const pressCoverage = settledValue(pressCoverageResult, [] as PressCoverageItem[], "press coverage");
  const reviewCandidates = settledValue(customerReviewsResult, [] as CustomerProductReview[], "customer reviews");

  const reviewSlugs = [...new Set(reviewCandidates.map((review) => review.productSlug).filter(Boolean))];
  const reviewProducts = reviewSlugs.length
    ? await getPublishedProductsBySlugs(reviewSlugs).catch((error) => {
        console.warn(
          `[homepage-bundle] review products failed: ${error instanceof Error ? error.message : String(error)}`
        );
        return [] as Product[];
      })
    : [];
  const reviewProductSlugs = new Set(reviewProducts.map((product) => product.slug));
  const maxReviews = Math.max(1, Math.min(6, homepageCmsV2.reviews.maxCount || 3));
  const sortOrder = homepageCmsV2.reviews.sortOrder;
  const sortedReviews = [...reviewCandidates].sort((left, right) => {
    const pinDelta = Number(right.pinned) - Number(left.pinned);
    if (pinDelta) return pinDelta;
    if (sortOrder === "rating") return right.rating - left.rating || Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (sortOrder === "manual") {
      return left.displayOrder - right.displayOrder || Date.parse(right.createdAt) - Date.parse(left.createdAt);
    }
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
  const customerReviews = sortedReviews
    .filter((review) => reviewProductSlugs.has(review.productSlug) && review.isVisible !== false)
    .slice(0, maxReviews);
  const products = mergeProductsBySlug(shelfProducts, reviewProducts);

  return {
    heroBanners: cms.home.heroBanners,
    cms,
    products,
    homepageCms,
    homepageCmsV2,
    relatedArticles,
    pressCoverage,
    customerReviews
  };
}
