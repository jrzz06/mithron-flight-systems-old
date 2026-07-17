import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("catalog search fallback and resilience", () => {
  it("builds a cached in-memory search index", () => {
    const catalog = source("services/catalog.ts");
    const searchIndex = source("lib/catalog-search-index.ts");

    expect(catalog).toContain("getCatalogSearchIndex");
    expect(catalog).toContain("catalogSearchIndexSelect");
    expect(catalog).toContain("searchCatalogIndex");
    expect(catalog).toContain("searchCatalogProductsFallback");
    expect(searchIndex).toContain("export function searchCatalogIndex");
    expect(searchIndex).toContain("getFeaturedFromCatalogIndex");
  });

  it("keeps Supabase RPC fallback for index failures", () => {
    const catalog = source("services/catalog.ts");

    expect(catalog).toContain("fetchCatalogSearchRowsFallback");
    expect(catalog).toContain("search_published_products RPC unavailable");
    expect(catalog).toContain("full-text search returned no matches");
  });

  it("skips search rows without resolvable images instead of throwing", () => {
    const catalog = source("services/catalog.ts");
    const mapSearchBlock = catalog.slice(
      catalog.indexOf("async function mapSearchRowsToCatalogResults"),
      catalog.indexOf("async function fetchMediaAssetChunk")
    );

    expect(mapSearchBlock).toContain("resolveProductImage");
    expect(mapSearchBlock).not.toContain("resolveHydratedProductImage");
    expect(mapSearchBlock).toContain("skipping search result without image");
    expect(mapSearchBlock).toContain("continue;");
  });

  it("prefetches the search index in the overlay (deferred from nav/shell)", () => {
    const searchOverlay = source("components/overlays/search-overlay.tsx");
    const storeNav = source("components/navigation/store-nav.tsx");
    const storeShell = source("components/layout/store-shell-client.tsx");

    expect(searchOverlay).toContain("intent=index");
    expect(searchOverlay).toContain("catalogSearchIndexPromise");
    expect(storeNav).not.toContain("intent=index");
    expect(storeShell).not.toContain("intent=index");
  });

  it("allows on-demand product pages for slugs discovered via search", () => {
    const productPage = source("app/(storefront)/product/[slug]/page.tsx");

    expect(productPage).toContain("export const dynamicParams = true");
    expect(productPage).toContain("loadProductForPage");
  });

  it("points SearchAction to the products catalog page", () => {
    const structuredData = source("lib/structured-data.ts");

    expect(structuredData).toContain('toAbsoluteUrl("/products")}?q={search_term_string}');
    expect(structuredData).toContain("buildSearchResultsItemListJsonLd");
  });
});
