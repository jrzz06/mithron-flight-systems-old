import { describe, expect, it } from "vitest";
import { appendBundlePricingSync, resolveCatalogPricing, syncStoredBundlePricing } from "@/lib/catalog-pricing";
import { resolveCartLine } from "@/lib/cart-pricing";

describe("catalog pricing", () => {
  it("derives sale and list pricing from the product record", () => {
    const pricing = resolveCatalogPricing({
      price: 383000,
      compare_at: 400000,
      on_sale: true,
      discount_type: "amount",
      discount_value: 17000
    });

    expect(pricing.salePrice).toBe(383000);
    expect(pricing.compareAt).toBe(400000);
    expect(pricing.onSale).toBe(true);
    expect(pricing.savings).toBe(17000);
  });

  it("syncs stored bundle prices from catalog pricing", () => {
    const pricing = resolveCatalogPricing({ price: 1200, compare_at: 1500, on_sale: true });
    const bundles = syncStoredBundlePricing(
      [{ id: "source-listing", price: 0, compareAt: 1, name: "Standard" }],
      pricing
    );

    expect(bundles?.[0]?.price).toBe(1200);
    expect(bundles?.[0]?.compareAt).toBe(1500);
  });

  it("appends bundle sync when admin pricing fields change", () => {
    const fields = appendBundlePricingSync(
      { price: 2500, compare_at: 3000, on_sale: true },
      {
        bundles: [{ id: "source-listing", price: 0, compareAt: 1 }]
      }
    );

    expect((fields.bundles as Array<{ price: number }>)[0]?.price).toBe(2500);
  });
});

describe("cart pricing", () => {
  it("resolves cart lines from live catalog pricing", () => {
    const line = resolveCartLine(
      { productSlug: "source-drone", bundleId: "source-listing", quantity: 2 },
      {
        slug: "source-drone",
        name: "Agri Drone",
        price: 500000,
        compare_at: 550000,
        on_sale: true,
        category: "Agri Drones",
        bundles: [{ id: "source-listing", name: "Standard", price: 0, description: "", includes: [] }]
      }
    );

    expect(line.unitPrice).toBe(500000);
    expect(line.compareAt).toBe(550000);
    expect(line.productName).toBe("Agri Drone");
  });
});
