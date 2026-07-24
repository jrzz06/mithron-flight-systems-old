"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { Product } from "@/config/types";
import {
  getCatalogCategoryDefinition,
  parseProductsCategoryParam
} from "@/lib/catalog-categories";
import {
  applyCatalogProductListing,
  buildCatalogOriginalOrder,
  buildProductsCatalogHref,
  parseCatalogProductGroupParam,
  parseCatalogSearchQueryParam,
  type CatalogProductGroup,
  type CatalogSortKey
} from "@/lib/catalog-product-listing";
import { buildCatalogShelfLayout } from "@/lib/catalog-shelf-layout";
import { clipProductPreviewText } from "@/lib/product-preview-text";
import { resolveCatalogEditorialPresentation } from "@/lib/media/catalog-editorial-presentation";
import { CatalogContinuedGrid } from "@/sections/catalog/catalog-continued-grid";
import { CatalogBrowseLeadGrid } from "@/sections/catalog/catalog-browse-lead-grid";
import { CatalogProductToolbar } from "@/sections/catalog/catalog-product-toolbar";
import styles from "./catalog-page.module.css";

type CatalogFilteredListingProps = {
  products: Product[];
  mode: "category" | "global";
  presentation: "standard" | "showroom";
  title: string;
  /** When true, hide the static catalog title (page hero already has the h1). */
  suppressListingTitle?: boolean;
  initialGroup?: CatalogProductGroup;
  initialQuery?: string;
  showBack?: boolean;
  backFallbackHref?: string;
};

function resolveLegacyProductsCategoryRedirect(categoryParam: string | null): string | null {
  const categorySlug = parseProductsCategoryParam(categoryParam ?? undefined);
  if (!categorySlug) return null;
  if (categorySlug === "accessories") {
    return buildProductsCatalogHref({ group: "accessories-spare-parts" });
  }
  if (categorySlug === "global-products") {
    return buildProductsCatalogHref({ group: "global-products" });
  }
  return getCatalogCategoryDefinition(categorySlug).href;
}

export function CatalogFilteredListing({
  products,
  mode,
  presentation,
  title,
  suppressListingTitle = false,
  initialGroup,
  initialQuery,
  showBack = false,
  backFallbackHref = "/products"
}: CatalogFilteredListingProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInternalNavigation = useRef(false);
  const isShowroom = presentation === "showroom";
  const urlGroup = parseCatalogProductGroupParam(searchParams.get("filter") ?? undefined);
  const urlQuery = parseCatalogSearchQueryParam(searchParams.get("q") ?? undefined);
  const group: CatalogProductGroup =
    mode === "global" ? (initialGroup ?? urlGroup) : "all";
  const [query, setQuery] = useState(initialQuery ?? urlQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery ?? urlQuery);
  const [sort, setSort] = useState<CatalogSortKey>("featured");

  useEffect(() => {
    if (mode !== "global") return;
    const redirectHref = resolveLegacyProductsCategoryRedirect(searchParams.get("category"));
    if (redirectHref) {
      router.replace(redirectHref);
    }
  }, [mode, router, searchParams]);

  useEffect(() => {
    if (isInternalNavigation.current) {
      isInternalNavigation.current = false;
      return;
    }

    const nextQuery = searchParams.get("q")?.trim() ?? "";
    setQuery((current) => (current === nextQuery ? current : nextQuery));
    setDebouncedQuery((current) => (current === nextQuery ? current : nextQuery));
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (mode !== "global") return;

    const currentQuery = searchParams.get("q")?.trim() ?? "";
    const currentFilter = searchParams.get("filter")?.trim() ?? "";
    const expectedFilter = group === "all" ? "" : group;
    if (debouncedQuery === currentQuery && expectedFilter === currentFilter) return;

    isInternalNavigation.current = true;
    router.replace(
      buildProductsCatalogHref({
        group: mode === "global" ? group : "all",
        q: debouncedQuery || undefined
      }),
      { scroll: false }
    );
  }, [debouncedQuery, group, mode, router, searchParams]);

  const originalOrder = useMemo(() => buildCatalogOriginalOrder(products), [products]);

  const filteredProducts = useMemo(
    () =>
      applyCatalogProductListing(products, {
        query: debouncedQuery,
        sort,
        group: mode === "global" ? group : "all",
        originalOrder
      }),
    [products, debouncedQuery, sort, group, mode, originalOrder]
  );

  const shelfLayout = useMemo(() => buildCatalogShelfLayout(filteredProducts), [filteredProducts]);
  const { featuredProduct, leadProducts, remainingProducts } = shelfLayout;

  const occupiedSlugs = useMemo(
    () =>
      new Set([
        ...leadProducts.map((product) => product.slug),
        ...(featuredProduct ? [featuredProduct.slug] : [])
      ]),
    [featuredProduct, leadProducts]
  );

  const safeRemainingProducts = useMemo(
    () => remainingProducts.filter((product) => !occupiedSlugs.has(product.slug)),
    [occupiedSlugs, remainingProducts]
  );

  const editorialPresentation = useMemo(
    () => (featuredProduct ? resolveCatalogEditorialPresentation(featuredProduct.slug) : null),
    [featuredProduct]
  );
  const cardPresentation = isShowroom ? "showroom" : "standard";
  const listingKey = `${debouncedQuery}-${sort}-${mode === "global" ? group : "category"}`;
  const hasActiveFilters =
    debouncedQuery.length > 0 || sort !== "featured" || (mode === "global" && group !== "all");
  // Editorial band uses the featured product's primary/Wix image (cutouts are no longer required).
  const showEditorialBand =
    !hasActiveFilters
    && featuredProduct !== null
    && safeRemainingProducts.length > 0;
  const browseLeadProducts = showEditorialBand
    ? leadProducts
    : filteredProducts.slice(0, 8);
  const browseRemainingProducts = showEditorialBand ? safeRemainingProducts : filteredProducts.slice(8);

  const clearFilters = () => {
    setQuery("");
    setDebouncedQuery("");
    setSort("featured");
    if (mode === "global") {
      isInternalNavigation.current = true;
      router.replace(buildProductsCatalogHref({ group: "all" }), { scroll: false });
    }
  };

  const clearSearch = () => {
    setQuery("");
    setDebouncedQuery("");
    if (mode === "global") {
      isInternalNavigation.current = true;
      router.replace(buildProductsCatalogHref({ group, q: undefined }), { scroll: false });
    }
  };

  const viewAllProducts = () => {
    setQuery("");
    setDebouncedQuery("");
    setSort("featured");
    if (mode === "global") {
      isInternalNavigation.current = true;
      router.replace(buildProductsCatalogHref({ group: "all" }), { scroll: false });
    }
  };

  const handleGroupChange = (value: CatalogProductGroup) => {
    if (mode === "global") {
      isInternalNavigation.current = true;
      router.replace(
        buildProductsCatalogHref({ group: value, q: debouncedQuery || undefined }),
        { scroll: false }
      );
    }
  };

  const displayTitle = debouncedQuery ? `Results for "${debouncedQuery}"` : title;
  const hasSearchQuery = debouncedQuery.length > 0;
  const catalogIsEmpty = products.length === 0;
  const emptyTitle = hasSearchQuery
    ? `No products found for '${debouncedQuery}'`
    : catalogIsEmpty
      ? "No products in this category yet"
      : "No products found";
  const emptyCopy = hasSearchQuery
    ? "Try a different keyword, adjust your filters, or browse all products."
    : catalogIsEmpty
      ? "This category is temporarily empty. Browse the full catalog or check back soon."
      : "Try a different search term, sort option, or category filter.";

  return (
    <div className={styles.listingRoot} data-catalog-listing>
      <CatalogProductToolbar
        mode={mode}
        presentation={presentation}
        title={displayTitle}
        suppressListingTitle={suppressListingTitle}
        hasSearchQuery={hasSearchQuery}
        query={query}
        sort={sort}
        group={group}
        resultCount={filteredProducts.length}
        showBack={showBack}
        backFallbackHref={backFallbackHref}
        onQueryChange={setQuery}
        onSortChange={setSort}
        onGroupChange={handleGroupChange}
      />

      {filteredProducts.length === 0 ? (
        <div
          className={isShowroom ? styles.emptyState : "catalog-empty-state"}
          data-testid="catalog-empty-state"
          data-catalog-empty={catalogIsEmpty ? "catalog" : hasSearchQuery ? "search" : "filters"}
        >
          <p className={isShowroom ? styles.emptyTitle : "catalog-empty-state__title type-section"}>
            {emptyTitle}
          </p>
          <p className={isShowroom ? styles.emptyCopy : "catalog-empty-state__copy type-body"}>
            {emptyCopy}
          </p>
          {hasSearchQuery ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={clearSearch} data-testid="catalog-clear-search">
                Clear Search
              </Button>
              <Button type="button" onClick={viewAllProducts} data-testid="catalog-view-all-products">
                View All Products
              </Button>
            </div>
          ) : catalogIsEmpty ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild data-testid="catalog-view-all-products">
                <Link href="/products">Browse all products</Link>
              </Button>
            </div>
          ) : hasActiveFilters ? (
            <Button type="button" variant="outline" onClick={clearFilters} data-testid="catalog-clear-filters">
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : hasActiveFilters ? (
        <CatalogContinuedGrid
          key={listingKey}
          products={filteredProducts}
          className="min-w-0"
          rowsClassName={isShowroom ? styles.productGrid : "catalog-product-grid min-w-0"}
          presentation={cardPresentation}
        />
      ) : (
        <>
          <CatalogBrowseLeadGrid
            products={browseLeadProducts}
            isShowroom={isShowroom}
            cardPresentation={cardPresentation}
            featuredProduct={featuredProduct}
            showEditorialBand={showEditorialBand}
            editorialPresentation={editorialPresentation}
            getCatalogPreview={getCatalogPreview}
          />

          {browseRemainingProducts.length > 0 ? (
            <CatalogContinuedGrid
              key={listingKey}
              products={browseRemainingProducts}
              className={isShowroom ? styles.productGridContinued : "catalog-product-grid--continued min-w-0"}
              presentation={cardPresentation}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function getCatalogPreview(value: string, limit: number) {
  return clipProductPreviewText(value, limit);
}
