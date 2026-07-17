import { describe, expect, it } from "vitest";
import { buildCatalogShelfLayout, dedupeProductsBySlug } from "@/lib/catalog-shelf-layout";
import type { Product } from "@/config/types";

const CUTOUT_SRC = "https://example.com/mithron-products/catalog-cutouts/v1/demo.webp";

function product(slug: string, name = slug, cutout = false): Product {
  const src = cutout ? CUTOUT_SRC : "/test.webp";
  return {
    slug,
    productUrl: `/product/${slug}`,
    name,
    tagline: "test",
    category: "Accessories",
    price: 100,
    image: { src, alt: name, width: 100, height: 100 },
    hero: { src, alt: name, width: 100, height: 100 },
    gallery: [],
    interests: [],
    specs: {},
    variants: [],
    bundles: [],
    hotspots: [],
    story: [],
    anchors: [],
    workflowStatus: "published",
    isVisible: true
  };
}

describe("catalog shelf layout", () => {
  it("removes duplicate slugs", () => {
    const items = [product("a"), product("a"), product("b")];
    expect(dedupeProductsBySlug(items).map((item) => item.slug)).toEqual(["a", "b"]);
  });

  it("keeps featured product out of lead and continued grids", () => {
    const items = Array.from({ length: 12 }, (_, index) => product(`item-${index}`, `item-${index}`, index === 1));
    const layout = buildCatalogShelfLayout(items);

    expect(layout.featuredProduct?.slug).toBe("item-1");
    expect(layout.leadProducts.some((item) => item.slug === "item-1")).toBe(false);
    expect(layout.remainingProducts.some((item) => item.slug === "item-1")).toBe(false);
    expect(layout.leadProducts).toHaveLength(8);
  });

  it("uses another cutout product when the preferred featured slot has no cutout", () => {
    const items = [
      product("item-0"),
      product("item-1"),
      product("item-2"),
      product("item-3", "item-3", true)
    ];
    const layout = buildCatalogShelfLayout(items);

    expect(layout.featuredProduct?.slug).toBe("item-3");
    expect(layout.leadProducts.some((item) => item.slug === "item-3")).toBe(false);
  });

  it("omits featured product when no catalog cutouts are available", () => {
    const items = [product("item-0"), product("item-1"), product("item-2")];
    const layout = buildCatalogShelfLayout(items);

    expect(layout.featuredProduct).toBeNull();
    expect(layout.leadProducts).toHaveLength(3);
  });

  it("does not repeat slugs across lead and continued sections", () => {
    const items = Array.from({ length: 40 }, (_, index) => product(`item-${index}`, `item-${index}`, index === 1));
    const layout = buildCatalogShelfLayout(items);
    const slugs = [...layout.leadProducts, ...layout.remainingProducts].map((item) => item.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
