import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSummary } from "@/services/customer-product-reviews";
import { canCustomerReviewOrder } from "@/lib/orders/review-eligibility";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("production customer review system", () => {
  it("extends customer_order_reviews with production fields and helpful votes", () => {
    const migration = source("supabase/migrations/20260715000300_customer_product_reviews_hardening.sql");
    expect(migration).toContain("title text");
    expect(migration).toContain("customer_name text");
    expect(migration).toContain("image_urls text[]");
    expect(migration).toContain("helpful_count integer");
    expect(migration).toContain("product_review_helpful_votes");
    expect(migration).toContain("customer_order_reviews_public_read");
  });

  it("exposes customer product review service operations", () => {
    const service = source("services/customer-product-reviews.ts");
    expect(service).toContain("listPublishedProductReviews");
    expect(service).toContain("listFeaturedHomeReviews");
    expect(service).toContain("listAdminProductReviews");
    expect(service).toContain("markReviewHelpful");
    expect(service).toContain("moderateCustomerReview");
    expect(service).toContain("createCustomerReviewAdmin");
    expect(service).toContain("deleteCustomerReviewAdmin");
  });

  it("loads customer reviews only on product pages", () => {
    const service = source("services/product-reviews.ts");
    const section = source("sections/product/product-reviews-async-section.tsx");
    const submitService = source("services/customer-order-reviews.ts");
    expect(service).toContain("getProductReviewsPayload");
    expect(service).not.toContain("getWixReviewsForSlug");
    expect(service).not.toContain("cmsReviews");
    expect(section).toContain("sourceCatalogId");
    expect(section).not.toContain("getProductReviewsCmsSlice");
    expect(submitService).toContain('status: "published"');
    expect(submitService).toContain("verified_purchase: true");
    expect(submitService).toContain("canCustomerReviewOrder");
  });

  it("shows empty state instead of hiding or fabricating reviews", () => {
    const section = source("sections/product/product-reviews-section.tsx");
    const composite = source("sections/home/home-landing-composite.tsx");
    expect(section).toContain("ReviewsEmptyState");
    expect(section).toContain("No reviews yet");
    expect(section).toContain("Most Helpful");
    expect(section).toContain("Lowest Rating");
    expect(section).toContain("reviewVerifiedBadge");
    expect(composite).not.toContain("HomeCustomerTestimonialsSection");
    expect(composite).toContain("HomeClientTestimonialsSection");
    expect(composite).not.toContain("representativeHomeReviewTemplates");
    expect(composite).not.toContain("pickRepresentativeHomeReviews");
    expect(composite).not.toContain("pickHomepageWixReviews");
  });

  it("wires admin review moderation module", () => {
    const nav = source("components/platform/nav-config.ts");
    const access = source("lib/auth/access-control.ts");
    expect(nav).toContain('href: "/admin/reviews"');
    expect(access).toContain('normalized.startsWith("/admin/reviews")');
    expect(source("app/admin/reviews/page.tsx")).toContain("AdminProductReviewQueue");
    expect(source("app/admin/reviews/page.tsx")).toContain("Add review");
    expect(source("app/admin/reviews/actions.ts")).toContain("moderateCustomerReview");
    expect(source("app/admin/reviews/actions.ts")).toContain("createCustomerReviewAdminFormAction");
    expect(source("components/admin/admin-product-review-queue.tsx")).toContain("product_slug");
    expect(source("components/admin/admin-product-review-queue.tsx")).toContain("customer_name");
    expect(source("components/admin/admin-product-review-queue.tsx")).toContain('name="body"');
  });

  it("builds rating summaries from real review rows", () => {
    const summary = buildSummary([
      {
        id: "1",
        authorName: "A",
        title: "Great",
        body: "Works well",
        rating: 5,
        source: "customer"
      },
      {
        id: "2",
        authorName: "B",
        title: "Okay",
        body: "Fine",
        rating: 3,
        source: "customer"
      }
    ]);
    expect(summary.totalReviews).toBe(2);
    expect(summary.averageRating).toBe(4);
    expect(summary.distribution[5]).toBe(1);
    expect(summary.distribution[3]).toBe(1);
  });

  it("allows reviews only after an order is dispatched", () => {
    expect(canCustomerReviewOrder({ status: "confirmed", fulfillment_status: "pending" })).toBe(false);
    expect(canCustomerReviewOrder({ status: "packed", fulfillment_status: "packed" })).toBe(false);
    expect(canCustomerReviewOrder({ status: "dispatched", fulfillment_status: "shipped" })).toBe(true);
    expect(canCustomerReviewOrder({ status: "in_transit", fulfillment_status: "shipped" })).toBe(true);
    expect(canCustomerReviewOrder({ status: "delivered", fulfillment_status: "delivered" })).toBe(true);
  });
});
