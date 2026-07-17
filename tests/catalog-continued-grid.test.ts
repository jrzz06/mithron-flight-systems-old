import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BATCH_SIZE,
  getVisibleProducts,
  INITIAL_BATCH,
  resolveColumnCount
} from "@/sections/catalog/catalog-continued-grid";
import type { Product } from "@/config/types";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function product(slug: string): Product {
  return {
    slug,
    productUrl: `/product/${slug}`,
    name: slug,
    tagline: "test",
    category: "Agri Drones",
    price: 100,
    image: { src: "/test.webp", alt: slug, width: 100, height: 100 },
    hero: { src: "/test.webp", alt: slug, width: 100, height: 100 },
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

describe("catalog continued grid", () => {
  it("reveals products in batches", () => {
    const items = Array.from({ length: 20 }, (_, index) => product(`item-${index}`));

    expect(getVisibleProducts(items, INITIAL_BATCH)).toHaveLength(8);
    expect(getVisibleProducts(items, INITIAL_BATCH + BATCH_SIZE)).toHaveLength(16);
    expect(getVisibleProducts(items, 100)).toHaveLength(20);
  });

  it("uses 2, 3, or 4 column breakpoints", () => {
    expect(resolveColumnCount(320)).toBe(2);
    expect(resolveColumnCount(375)).toBe(2);
    expect(resolveColumnCount(600)).toBe(2);
    expect(resolveColumnCount(767)).toBe(2);
    expect(resolveColumnCount(800)).toBe(3);
    expect(resolveColumnCount(1023)).toBe(3);
    expect(resolveColumnCount(1024)).toBe(4);
    expect(resolveColumnCount(1280)).toBe(4);
    expect(resolveColumnCount(1920)).toBe(4);
  });

  it("renders a load-more grid without window virtualization", () => {
    const gridSource = source("sections/catalog/catalog-continued-grid.tsx");
    const listingSource = source("sections/catalog/catalog-filtered-listing.tsx");
    const pageSource = source("sections/catalog/catalog-page.tsx");

    expect(gridSource).toContain("INITIAL_BATCH = 8");
    expect(gridSource).toContain("BATCH_SIZE = 8");
    expect(gridSource).toContain("Load more products");
    expect(gridSource).toContain('data-testid="catalog-load-more"');
    expect(gridSource).toContain("catalog-continued-grid__rows");
    expect(gridSource).toContain("rowsClassName");
    expect(gridSource).not.toContain("useWindowVirtualizer");
    expect(listingSource).toContain("CatalogContinuedGrid");
    expect(listingSource).toContain("key={listingKey}");
    expect(listingSource).toContain('className="min-w-0"');
    expect(listingSource).toContain('rowsClassName={isShowroom ? styles.productGrid : "catalog-product-grid min-w-0"}');
    expect(listingSource).toMatch(
      /hasActiveFilters \?[\s\S]*?<CatalogContinuedGrid[\s\S]*?className="min-w-0"/
    );
    expect(listingSource).toContain("CatalogProductToolbar");
    expect(pageSource).toContain("CatalogFilteredListing");
    expect(pageSource).not.toContain("CatalogVirtualizedGrid");
  });

  it("matches lead grid column breakpoints in globals css", () => {
    const globalsCss = source("app/globals.css");
    const catalogCss = source("app/storefront-catalog.css");
    const catalogGridBlock = globalsCss.match(
      /\.catalog-product-grid \{[\s\S]*?\.catalog-product-grid--continued/
    )?.[0];

    expect(globalsCss).toMatch(
      /\.catalog-product-grid[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(globalsCss).toMatch(
      /@media \(min-width: 768px\) and \(max-width: 1023px\)[\s\S]*\.catalog-product-grid[\s\S]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(catalogCss).toMatch(
      /@media \(min-width: 1024px\)[\s\S]*\.catalog-product-grid[\s\S]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(catalogCss).toMatch(
      /@media \(min-width: 1024px\)[\s\S]*\.catalog-continued-grid__rows[\s\S]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(catalogGridBlock).not.toMatch(/auto-fill/);
  });
});
