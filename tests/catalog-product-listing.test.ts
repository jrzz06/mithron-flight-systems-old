import { describe, expect, it } from "vitest";
import type { Product } from "@/config/types";
import {
  buildProductsCatalogHref,
  parseCatalogProductGroupParam,
  parseCatalogSearchQueryParam,
  applyCatalogProductListing,
  isAccessoryGroupProduct,
  isDroneGroupProduct,
  isSparePartProduct,
  matchesCatalogProductGroup
} from "@/lib/catalog-product-listing";

function product(overrides: Partial<Product> & Pick<Product, "slug" | "name" | "category">): Product {
  return {
    productUrl: `/product/${overrides.slug}`,
    tagline: overrides.tagline ?? "Test tagline",
    price: overrides.price ?? 1000,
    image: { src: "/test.webp", alt: overrides.name, width: 100, height: 100 },
    hero: { src: "/test.webp", alt: overrides.name, width: 100, height: 100 },
    gallery: [],
    interests: overrides.interests ?? [],
    specs: {},
    variants: [],
    bundles: [],
    hotspots: [],
    story: [],
    anchors: [],
    workflowStatus: "published",
    isVisible: true,
    publishedAt: overrides.publishedAt,
    ...overrides
  };
}

describe("catalog product listing", () => {
  const products = [
    product({
      slug: "alpha-drone",
      name: "Alpha Drone",
      category: "Agri Drones",
      price: 500000,
      publishedAt: "2024-01-10T00:00:00.000Z"
    }),
    product({
      slug: "beta-camera",
      name: "Beta Camera",
      category: "Accessories",
      tagline: "4K gimbal camera for mapping",
      price: 120000,
      publishedAt: "2024-06-01T00:00:00.000Z"
    }),
    product({
      slug: "gamma-frame",
      name: "Gamma CFRP Frame",
      category: "Accessories",
      tagline: "Replacement drone frame",
      price: 18000,
      publishedAt: "2023-03-01T00:00:00.000Z"
    }),
    product({
      slug: "delta-global",
      name: "Delta Global",
      category: "Global Products",
      price: 900000,
      publishedAt: "2025-01-01T00:00:00.000Z"
    })
  ];

  it("filters products by tokenized search query", () => {
    const results = applyCatalogProductListing(products, { query: "gamma frame" });
    expect(results.map((item) => item.slug)).toEqual(["gamma-frame"]);
  });

  it("filters products by single-character search query", () => {
    const results = applyCatalogProductListing(products, { query: "4" });
    expect(results.map((item) => item.slug)).toEqual(["beta-camera"]);
  });

  it("returns all products for whitespace-only search query", () => {
    const results = applyCatalogProductListing(products, { query: "   " });
    expect(results).toHaveLength(products.length);
  });

  it("filters products by derived SKU", () => {
    const results = applyCatalogProductListing(products, { query: "alpha-drone" });
    expect(results.map((item) => item.slug)).toEqual(["alpha-drone"]);
  });

  it("sorts by price ascending and descending", () => {
    const ascending = applyCatalogProductListing(products, { sort: "price-asc" });
    const descending = applyCatalogProductListing(products, { sort: "price-desc" });

    expect(ascending.map((item) => item.slug)).toEqual([
      "gamma-frame",
      "beta-camera",
      "alpha-drone",
      "delta-global"
    ]);
    expect(descending.map((item) => item.slug)).toEqual([
      "delta-global",
      "alpha-drone",
      "beta-camera",
      "gamma-frame"
    ]);
  });

  it("sorts by name ascending and descending", () => {
    const nameAsc = applyCatalogProductListing(products, { sort: "name-asc" });
    const nameDesc = applyCatalogProductListing(products, { sort: "name-desc" });

    expect(nameAsc[0]?.name).toBe("Alpha Drone");
    expect(nameDesc[0]?.name).toBe("Gamma CFRP Frame");
  });

  it("sorts names with natural numeric ordering", () => {
    const numbered = [
      product({ slug: "d10", name: "Drone 10", category: "Agri Drones" }),
      product({ slug: "d2", name: "Drone 2", category: "Agri Drones" }),
      product({ slug: "d100", name: "Drone 100", category: "Agri Drones" }),
      product({ slug: "d20", name: "Drone 20", category: "Agri Drones" }),
      product({ slug: "d9", name: "Drone 9", category: "Agri Drones" })
    ];

    const ascending = applyCatalogProductListing(numbered, { sort: "name-asc" });
    const descending = applyCatalogProductListing(numbered, { sort: "name-desc" });

    expect(ascending.map((item) => item.name)).toEqual([
      "Drone 2",
      "Drone 9",
      "Drone 10",
      "Drone 20",
      "Drone 100"
    ]);
    expect(descending.map((item) => item.name)).toEqual([
      "Drone 100",
      "Drone 20",
      "Drone 10",
      "Drone 9",
      "Drone 2"
    ]);
  });

  it("sorts mixed alphanumeric names naturally", () => {
    const mixed = [
      product({ slug: "a10", name: "Alpha 10", category: "Agri Drones" }),
      product({ slug: "a2", name: "Alpha 2", category: "Agri Drones" }),
      product({ slug: "beta", name: "Beta", category: "Agri Drones" }),
      product({ slug: "a9", name: "Alpha 9", category: "Agri Drones" })
    ];

    const ascending = applyCatalogProductListing(mixed, { sort: "name-asc" });

    expect(ascending.map((item) => item.name)).toEqual([
      "Alpha 2",
      "Alpha 9",
      "Alpha 10",
      "Beta"
    ]);
  });

  it("preserves featured order from the source list", () => {
    const featured = applyCatalogProductListing(products, { sort: "featured" });
    expect(featured.map((item) => item.slug)).toEqual(products.map((item) => item.slug));
  });

  it("filters by product groups for the global catalog", () => {
    expect(matchesCatalogProductGroup(products[0]!, "drones")).toBe(true);
    expect(matchesCatalogProductGroup(products[1]!, "accessories-spare-parts")).toBe(true);
    expect(matchesCatalogProductGroup(products[2]!, "accessories-spare-parts")).toBe(true);
    expect(matchesCatalogProductGroup(products[3]!, "global-products")).toBe(true);
    expect(matchesCatalogProductGroup(products[3]!, "drones")).toBe(false);

    const drones = applyCatalogProductListing(products, { group: "drones" });
    const accessoriesSpareParts = applyCatalogProductListing(products, { group: "accessories-spare-parts" });
    const globalProducts = applyCatalogProductListing(products, { group: "global-products" });

    expect(drones.map((item) => item.slug)).toEqual(["alpha-drone"]);
    expect(accessoriesSpareParts.map((item) => item.slug)).toEqual(["beta-camera", "gamma-frame"]);
    expect(globalProducts.map((item) => item.slug)).toEqual(["delta-global"]);
  });

  it("parses catalog product group query params", () => {
    expect(parseCatalogProductGroupParam(undefined)).toBe("all");
    expect(parseCatalogProductGroupParam("")).toBe("all");
    expect(parseCatalogProductGroupParam("drones")).toBe("drones");
    expect(parseCatalogProductGroupParam("accessories-spare-parts")).toBe("accessories-spare-parts");
    expect(parseCatalogProductGroupParam("global-products")).toBe("global-products");
    expect(parseCatalogProductGroupParam("unknown")).toBe("all");
  });

  it("builds products catalog hrefs from filter groups", () => {
    expect(buildProductsCatalogHref("all")).toBe("/products");
    expect(buildProductsCatalogHref("drones")).toBe("/products?filter=drones");
    expect(buildProductsCatalogHref("accessories-spare-parts")).toBe("/products?filter=accessories-spare-parts");
    expect(buildProductsCatalogHref("global-products")).toBe("/products?filter=global-products");
  });

  it("builds products catalog hrefs with search query", () => {
    expect(buildProductsCatalogHref({ group: "all", q: "drone" })).toBe("/products?q=drone");
    expect(buildProductsCatalogHref({ group: "drones", q: "drone" })).toBe("/products?filter=drones&q=drone");
    expect(buildProductsCatalogHref({ group: "all", q: "   " })).toBe("/products");
  });

  it("parses catalog search query params", () => {
    expect(parseCatalogSearchQueryParam(undefined)).toBe("");
    expect(parseCatalogSearchQueryParam("  drone  ")).toBe("drone");
  });

  it("matches products by interests and description fields", () => {
    const enriched = [
      product({
        slug: "mapping-drone",
        name: "Mapping Platform",
        category: "Survey Drones",
        interests: ["precision-mapping"],
        description: "Industrial aerial survey platform"
      })
    ];

    expect(applyCatalogProductListing(enriched, { query: "precision" }).map((item) => item.slug)).toEqual([
      "mapping-drone"
    ]);
    expect(applyCatalogProductListing(enriched, { query: "survey" }).map((item) => item.slug)).toEqual([
      "mapping-drone"
    ]);
  });

  it("combines search, sort, and group filters", () => {
    const results = applyCatalogProductListing(
      [
        ...products,
        product({
          slug: "zeta-arm",
          name: "Zeta Arm",
          category: "Accessories",
          tagline: "Replacement arm kit",
          price: 9000
        })
      ],
      {
        query: "replacement",
        sort: "price-desc",
        group: "accessories-spare-parts"
      }
    );

    expect(results.map((item) => item.slug)).toEqual(["gamma-frame", "zeta-arm"]);
  });

  it("classifies drone, accessory, and spare part products", () => {
    expect(isDroneGroupProduct(products[0]!)).toBe(true);
    expect(isAccessoryGroupProduct(products[1]!)).toBe(true);
    expect(isSparePartProduct(products[2]!)).toBe(true);
    expect(isAccessoryGroupProduct(products[2]!)).toBe(false);
  });
});
