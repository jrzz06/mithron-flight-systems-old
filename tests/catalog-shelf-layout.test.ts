import { describe, expect, it } from "vitest";
import { buildCatalogShelfLayout, dedupeProductsBySlug } from "@/lib/catalog-shelf-layout";
import type { Product } from "@/config/types";

function product(slug: string, name = slug): Product {
  return {
    slug,
    productUrl: `/product/${slug}`,
    name,
    tagline: "test",
    category: "Accessories",
    price: 100,
    image: { src: "/test.webp", alt: name, width: 100, height: 100 },
    hero: { src: "/test.webp", alt: name, width: 100, height: 100 },
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
    const items = Array.from({ length: 12 }, (_, index) => product(`item-${index}`));
    const layout = buildCatalogShelfLayout(items);

    expect(layout.featuredProduct?.slug).toBe("item-1");
    expect(layout.leadProducts.some((item) => item.slug === "item-1")).toBe(false);
    expect(layout.remainingProducts.some((item) => item.slug === "item-1")).toBe(false);
    expect(layout.leadProducts).toHaveLength(8);
  });

  it("features the preferred slot even without cutouts", () => {
    const items = [product("item-0"), product("item-1"), product("item-2"), product("item-3")];
    const layout = buildCatalogShelfLayout(items);

    expect(layout.featuredProduct?.slug).toBe("item-1");
    expect(layout.leadProducts.some((item) => item.slug === "item-1")).toBe(false);
  });

  it("features the first product when only one exists", () => {
    const items = [product("item-0")];
    const layout = buildCatalogShelfLayout(items);

    expect(layout.featuredProduct?.slug).toBe("item-0");
    expect(layout.leadProducts).toHaveLength(0);
  });

  it("does not repeat slugs across lead and continued sections", () => {
    const items = Array.from({ length: 40 }, (_, index) => product(`item-${index}`));
    const layout = buildCatalogShelfLayout(items);
    const slugs = [...layout.leadProducts, ...layout.remainingProducts].map((item) => item.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
