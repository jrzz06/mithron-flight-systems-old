import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("product reviews", () => {
  it("loads customer reviews only on product pages", () => {
    const service = source("services/product-reviews.ts");
    const section = source("sections/product/product-reviews-async-section.tsx");
    expect(service).toContain("getProductReviewsPayload");
    expect(service).not.toContain("getWixReviewsForSlug");
    expect(service).not.toContain("resolveWixProductSlug");
    expect(service).not.toContain("mergeProductReviewsPayload");
    expect(service).not.toContain("mapCmsReview");
    expect(section).toContain("sourceCatalogId");
    expect(section).not.toContain("getProductReviewsCmsSlice");
  });

  it("always mounts Customer Reviews with id=reviews (no LazyHydrate gate)", () => {
    const belowFold = source("sections/product/product-below-fold.tsx");
    const reviewsSection = source("sections/product/product-reviews-section.tsx");
    const page = source("app/(storefront)/product/[slug]/page.tsx");

    const start = belowFold.indexOf("export function ProductReviewsLazySection");
    const end = belowFold.indexOf("function ProductRelatedLazySection");
    const reviewsLazyFn = start >= 0 && end > start ? belowFold.slice(start, end) : "";
    expect(reviewsLazyFn).toContain("ProductReviewsSection");
    expect(reviewsLazyFn).not.toContain("LazyHydrate");
    expect(belowFold).not.toContain("ProductReviewsFallback");

    expect(reviewsSection).toContain('id="reviews"');
    expect(reviewsSection).toContain("Customer Reviews");
    expect(reviewsSection).toContain("ReviewsEmptyState");
    expect(reviewsSection).toContain("!reviews.length");

    expect(page).toContain("ProductReviewsAsyncSection");
  });
});
