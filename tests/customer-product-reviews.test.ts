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

  it("allows multiple reviews per user on the same product via per-order uniqueness", () => {
    const migration = source("supabase/migrations/20260825000100_customer_reviews_per_order_uniqueness.sql");
    expect(migration).toContain("drop index if exists public.customer_order_reviews_unique_customer_per_product_uidx");
    expect(migration).toContain("customer_order_reviews_unique_per_order_item_uidx");
    expect(migration).toContain("(order_id, product_slug, user_id)");
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
    expect(service).toContain("getCustomerProductReviewContext");
    expect(service).toContain("writableOrders");
    expect(service).toContain("ownReviews");
  });

  it("allows owners to edit published reviews without pending gate", () => {
    const service = source("services/customer-product-reviews.ts");
    expect(service).toContain("updateCustomerReviewByOwner");
    expect(service).not.toContain("Published reviews cannot be edited");
    expect(service).toContain('existing.status === "published" ? "published"');
  });

  it("loads customer reviews only on product pages", () => {
    const service = source("services/product-reviews.ts");
    const section = source("sections/product/product-reviews-async-section.tsx");
    const submitService = source("services/customer-order-reviews.ts");
    expect(service).toContain("getProductReviewsPayload");
    expect(service).not.toContain("getWixReviewsForSlug");
    expect(service).not.toContain("cmsReviews");
    expect(section).toContain("sourceCatalogId");
    expect(section).toContain("getCustomerProductReviewContext");
    expect(section).not.toContain("getProductReviewsCmsSlice");
    expect(submitService).toContain('status: "published"');
    expect(submitService).toContain("verified_purchase: true");
    expect(submitService).toContain("canCustomerReviewOrder");
  });

  it("shows empty state, multi-review CTAs, and edit path on product pages", () => {
    const section = source("sections/product/product-reviews-section.tsx");
    const form = source("components/customer/order-review-form.tsx");
    const api = source("app/api/account/reviews/route.ts");
    const composite = source("sections/home/home-landing-composite.tsx");
    expect(section).toContain("ReviewsEmptyState");
    expect(section).toContain("No reviews yet");
    expect(section).toContain("Most Helpful");
    expect(section).toContain("Lowest Rating");
    expect(section).toContain("reviewVerifiedBadge");
    expect(section).toContain("Write another review");
    expect(section).toContain("Write a review");
    expect(section).toContain("Edit your review");
    expect(section).toContain("Sign in to write a review");
    expect(section).toContain('id="write-review"');
    expect(form).toContain('method: "PATCH"');
    expect(form).toContain("Save changes");
    expect(api).toContain("export async function PATCH");
    expect(api).toContain("updateCustomerReviewByOwner");
    expect(composite).not.toContain("HomeCustomerTestimonialsSection");
    expect(composite).toContain("HomeClientTestimonialsSection");
    expect(composite).not.toContain("representativeHomeReviewTemplates");
    expect(composite).not.toContain("pickRepresentativeHomeReviews");
    expect(composite).not.toContain("pickHomepageWixReviews");
  });

  it("removes admin review moderation UI while keeping storefront review reads", () => {
    const nav = source("components/platform/nav-config.ts");
    expect(nav).not.toContain('href: "/admin/reviews"');
    expect(nav).not.toContain('label: "Reviews"');
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

  it("supports multi-review eligibility types for repurchase", () => {
    const eligibility = source("lib/orders/review-eligibility.ts");
    expect(eligibility).toContain("WritableReviewOrder");
    expect(eligibility).toContain("OwnProductReviewSummary");
    expect(eligibility).toContain("CustomerProductReviewContext");
    expect(eligibility).toContain("awaiting_dispatch");
    expect(eligibility).toContain("not_purchased");
  });
});
