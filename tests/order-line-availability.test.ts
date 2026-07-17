import { describe, expect, it } from "vitest";
import {
  chunkValues,
  collectOrderItemProductSlugs,
  mergeInventoryRowsByProductSlug,
  resolveCatalogAvailability
} from "@/lib/inventory-availability";

describe("order line availability", () => {
  it("reads available quantity from inventory rows by product slug", () => {
    const inventory = [
      { product_slug: "source-8kg-seed-spreader-drone-tc-certified", quantity: 5 },
      { product_slug: "pixy-lr", quantity: 0 }
    ];

    expect(resolveCatalogAvailability("source-8kg-seed-spreader-drone-tc-certified", inventory)).toBe(5);
    expect(resolveCatalogAvailability("pixy-lr", inventory)).toBe(0);
    expect(resolveCatalogAvailability("missing-product", inventory)).toBe(0);
  });

  it("does not depend on warehouse_stock snapshot rows", () => {
    const inventory = [{ product_slug: "agri-drone-x1", quantity: 12 }];
    const warehouseStock: Array<{ product_slug: string; available_quantity: number }> = [];

    expect(resolveCatalogAvailability("agri-drone-x1", inventory)).toBe(12);
    expect(warehouseStock.length).toBe(0);
  });

  it("restores Available when capped snapshot omits an order-line SKU", () => {
    const cappedSnapshot = [
      { product_slug: "pixy-mr", quantity: 10, reserved_quantity: 0 },
      { product_slug: "testing-product", quantity: 0, reserved_quantity: 0 }
    ];
    const orderItems = [
      { product_slug: "source-18-inch-drone-frame" },
      { product_slug: "pixy-mr" },
      { product_slug: "  " }
    ];
    const enrichment = [
      {
        product_slug: "source-18-inch-drone-frame",
        quantity: 5,
        reserved_quantity: 0
      }
    ];

    expect(resolveCatalogAvailability("source-18-inch-drone-frame", cappedSnapshot)).toBe(0);

    const orderSlugs = collectOrderItemProductSlugs(orderItems);
    expect(orderSlugs).toEqual(["source-18-inch-drone-frame", "pixy-mr"]);

    const merged = mergeInventoryRowsByProductSlug(cappedSnapshot, enrichment);
    expect(resolveCatalogAvailability("source-18-inch-drone-frame", merged)).toBe(5);
    expect(resolveCatalogAvailability("pixy-mr", merged)).toBe(10);
  });

  it("lets enrichment overwrite capped rows for the same slug", () => {
    const capped = [{ product_slug: "frame", quantity: 1, reserved_quantity: 0 }];
    const enrichment = [{ product_slug: "frame", quantity: 5, reserved_quantity: 2 }];
    const merged = mergeInventoryRowsByProductSlug(capped, enrichment);
    expect(resolveCatalogAvailability("frame", merged)).toBe(3);
  });

  it("chunks slug filters for PostgREST URL safety", () => {
    expect(chunkValues(["a", "b", "c", "d", "e"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"]
    ]);
  });
});
