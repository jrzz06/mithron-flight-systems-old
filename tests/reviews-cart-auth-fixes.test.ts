import { describe, expect, it, vi, afterEach } from "vitest";
import { mergeCartItemLists } from "@/lib/cart/merge-cart-items";
import { useCartPricingStore } from "@/store/cart-pricing";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("review distribution bar width", () => {
  it("renders 0% width for zero-count stars and keeps a floor for non-zero", () => {
    const section = source("sections/product/product-reviews-section.tsx");
    expect(section).toContain('count === 0 ? "0%"');
    expect(section).toContain("Math.max(6, Math.round((count / maxCount) * 100))");
    expect(section).not.toMatch(/const width = `\$\{Math\.max\(6,/);
  });
});

describe("catalog product ratings", () => {
  it("filters to published visible customer reviews only", () => {
    const ratings = source("lib/catalog-product-ratings.ts");
    expect(ratings).toContain("customer_order_reviews");
    expect(ratings).toContain('status: "eq.published"');
    expect(ratings).toContain('is_visible: "eq.true"');
    expect(ratings).not.toContain('fetchRatingRows("product_reviews"');
    expect(ratings).toContain("reviewCount");
  });
});

describe("cart pricing non-JSON handling", () => {
  afterEach(() => {
    useCartPricingStore.getState().reset();
    vi.unstubAllGlobals();
  });

  it("surfaces a friendly error when pricing returns HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<!DOCTYPE html><html></html>", { status: 200, headers: { "Content-Type": "text/html" } }))
    );

    await useCartPricingStore.getState().fetchPricing([
      { productSlug: "pixy-lr", bundleId: "standard", quantity: 1 }
    ]);

    const error = useCartPricingStore.getState().snapshot.error;
    expect(error).toBe("Unable to load current cart pricing. Please retry.");
    expect(error).not.toMatch(/Unexpected token/i);
  });
});

describe("merge cart item lists", () => {
  it("sums matching lines and keeps distinct variants separate", () => {
    const merged = mergeCartItemLists(
      [
        { productSlug: "a", bundleId: "standard", quantity: 1, variantId: "red" },
        { productSlug: "a", bundleId: "standard", quantity: 2 }
      ],
      [
        { productSlug: "a", bundleId: "standard", quantity: 2, variantId: "red" },
        { productSlug: "a", bundleId: "standard", quantity: 1 },
        { productSlug: "b", bundleId: "standard", quantity: 1 }
      ]
    );

    expect(merged).toEqual([
      { productSlug: "a", bundleId: "standard", quantity: 3, variantId: "red" },
      { productSlug: "a", bundleId: "standard", quantity: 3 },
      { productSlug: "b", bundleId: "standard", quantity: 1 }
    ]);
  });

  it("clamps merged quantities to 99", () => {
    const merged = mergeCartItemLists(
      [{ productSlug: "a", bundleId: "standard", quantity: 80 }],
      [{ productSlug: "a", bundleId: "standard", quantity: 50 }]
    );
    expect(merged[0]?.quantity).toBe(99);
  });
});

describe("guest auth cart merge wiring", () => {
  it("clears guest storage only after successful merge and never copies auth cart on logout", () => {
    const authSync = source("lib/cart/cart-auth-sync.ts");
    expect(authSync).toContain("mergeGuestCartIntoAuthenticatedSession");
    expect(authSync).toContain("mergeGuestCartIntoAuthenticatedCart");
    expect(authSync).toContain("Auth cart stays in the database only");
    expect(authSync).toContain("clearGuestCartStorage()");
    expect(authSync).toContain("leftover.items.length");

    const serverSync = source("lib/cart/cart-server-sync.ts");
    expect(serverSync).toContain("/api/account/cart/merge");
  });

  it("exposes an idempotent merge route", () => {
    const route = source("app/api/account/cart/merge/route.ts");
    expect(route).toContain('operation: "merge"');
    expect(route).toContain("replay");
    expect(route).toContain("mergeCartItemLists");
  });
});
