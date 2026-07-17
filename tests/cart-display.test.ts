import { describe, expect, it } from "vitest";
import { buildOptimisticCartLines, cartLinesMatchPersisted, mergeCartDisplayWithPricing } from "@/lib/cart-display";
import type { CartItem } from "@/config/types";

describe("cart display helpers", () => {
  it("builds optimistic cart lines from persisted display metadata", () => {
    const lines = buildOptimisticCartLines([
      {
        productSlug: "pixy-lr",
        bundleId: "standard",
        quantity: 2,
        productName: "Pixy LR",
        bundleName: "Standard configuration",
        image: "/assets/products/pixy.webp"
      }
    ]);

    expect(lines).toEqual([
      {
        productSlug: "pixy-lr",
        bundleId: "standard",
        quantity: 2,
        productName: "Pixy LR",
        bundleName: "Standard configuration",
        unitPrice: 0,
        compareAt: null,
        image: "/assets/products/pixy.webp"
      }
    ]);
  });

  it("humanizes slugs when display metadata is missing", () => {
    const [line] = buildOptimisticCartLines([
      { productSlug: "source-agri-kisan-drone-small-8-liter", bundleId: "standard", quantity: 1 }
    ]);

    expect(line?.productName).toBe("Agri Kisan Drone Small 8 Liter");
    expect(line?.bundleName).toBe("Standard configuration");
  });

  it("matches resolved lines to persisted cart quantities", () => {
    const persisted = [{ productSlug: "pixy-lr", bundleId: "standard", quantity: 1 }];
    const resolved: CartItem[] = [
      {
        productSlug: "pixy-lr",
        bundleId: "standard",
        quantity: 1,
        productName: "Pixy LR",
        bundleName: "Standard configuration",
        unitPrice: 1000,
        image: ""
      }
    ];

    expect(cartLinesMatchPersisted(persisted, resolved)).toBe(true);
    expect(
      cartLinesMatchPersisted([{ productSlug: "pixy-lr", bundleId: "standard", quantity: 2 }], resolved)
    ).toBe(false);
  });

  it("enriches display lines with resolved pricing without replacing persisted metadata", () => {
    const displayLines = buildOptimisticCartLines([
      {
        productSlug: "pixy-lr",
        bundleId: "standard",
        quantity: 1,
        productName: "Pixy LR",
        bundleName: "Standard configuration",
        image: "/assets/products/pixy.webp"
      }
    ]);

    const merged = mergeCartDisplayWithPricing(displayLines, [
      {
        productSlug: "pixy-lr",
        bundleId: "standard",
        quantity: 1,
        productName: "Server Pixy LR",
        bundleName: "Server bundle",
        unitPrice: 125000,
        compareAt: 140000,
        image: "/server.webp"
      }
    ]);

    expect(merged[0]).toMatchObject({
      productName: "Pixy LR",
      bundleName: "Standard configuration",
      image: "/assets/products/pixy.webp",
      unitPrice: 125000,
      compareAt: 140000
    });
  });
});
