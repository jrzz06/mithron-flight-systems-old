import { describe, expect, it } from "vitest";
import type { Product } from "@/config/types";
import { isCatalogCutoutAsset, resolveCatalogCutoutAsset } from "@/lib/media/catalog-cutout";

function product(overrides: Partial<Product> & Pick<Product, "slug">): Product {
  return {
    productUrl: `/product/${overrides.slug}`,
    name: overrides.slug,
    tagline: "test",
    category: "Accessories",
    price: 100,
    image: { src: "/primary.webp", alt: "primary", width: 100, height: 100 },
    hero: { src: "/hero.webp", alt: "hero", width: 100, height: 100 },
    gallery: [],
    interests: [],
    specs: {},
    variants: [],
    bundles: [],
    hotspots: [],
    story: [],
    anchors: [],
    workflowStatus: "published",
    isVisible: true,
    ...overrides
  };
}

describe("catalog cutout media", () => {
  it("detects catalog cutout assets by storage path", () => {
    expect(isCatalogCutoutAsset({ src: "https://example.com/mithron-products/catalog-cutouts/v1/demo.webp" })).toBe(true);
    expect(isCatalogCutoutAsset({ src: "https://example.com/mithron-products/products/demo.webp" })).toBe(false);
  });

  it("prefers cutout assets from image, gallery, then hero", () => {
    const cutout = {
      src: "https://example.com/mithron-products/catalog-cutouts/v1/pixy-lr.webp",
      alt: "Pixy LR cutout",
      width: 100,
      height: 100
    };

    expect(resolveCatalogCutoutAsset(product({ slug: "a", image: cutout }))).toEqual(cutout);
    expect(
      resolveCatalogCutoutAsset(
        product({
          slug: "b",
          gallery: [cutout]
        })
      )
    ).toEqual(cutout);
    expect(
      resolveCatalogCutoutAsset(
        product({
          slug: "c",
          hero: cutout
        })
      )
    ).toEqual(cutout);
    expect(resolveCatalogCutoutAsset(product({ slug: "d" }))).toBeNull();
  });
});
