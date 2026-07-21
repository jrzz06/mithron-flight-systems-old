"use client";

import { Search } from "@/components/icons/storefront-icons";
import { StoreBackButton } from "@/components/navigation/store-back-button";
import {
  CATALOG_GROUP_OPTIONS,
  CATALOG_SORT_OPTIONS,
  type CatalogProductGroup,
  type CatalogSortKey
} from "@/lib/catalog-product-listing";
import { cn } from "@/lib/utils";
import styles from "./catalog-product-toolbar.module.css";

export type CatalogProductToolbarProps = {
  mode: "category" | "global";
  presentation?: "standard" | "showroom";
  title: string;
  eyebrow?: string;
  query: string;
  sort: CatalogSortKey;
  group: CatalogProductGroup;
  resultCount: number;
  showBack?: boolean;
  backFallbackHref?: string;
  onQueryChange: (value: string) => void;
  onSortChange: (value: CatalogSortKey) => void;
  onGroupChange: (value: CatalogProductGroup) => void;
};

export function CatalogProductToolbar({
  mode,
  presentation = "standard",
  title,
  eyebrow = "Catalog",
  query,
  sort,
  group,
  resultCount,
  showBack = false,
  backFallbackHref = "/products",
  onQueryChange,
  onSortChange,
  onGroupChange
}: CatalogProductToolbarProps) {
  const resultLabel = `${resultCount} product${resultCount === 1 ? "" : "s"}`;

  return (
    <>
      <div
        className={cn(styles.listingHeader, presentation === "showroom" && styles.listingHeaderShowroom)}
        data-testid="catalog-intro"
      >
        <div className={styles.headerTitleBlock}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
        </div>
      </div>

      <div
        className={styles.toolbar}
        data-testid="catalog-product-toolbar"
      >
        <div className={styles.toolbarInner}>
          {showBack ? (
            <StoreBackButton
              embedded
              fallbackHref={backFallbackHref}
              className={styles.toolbarBack}
            />
          ) : null}

          <label className={styles.searchField}>
            <Search aria-hidden className={styles.searchIcon} />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={mode === "global" ? "Search all products" : "Search in this category"}
              aria-label={mode === "global" ? "Search all products" : "Search products in this category"}
              data-testid="catalog-search-input"
              className={styles.searchInput}
              autoComplete="off"
            />
          </label>

          <label className={styles.sortField}>
            <span className="sr-only">Sort products</span>
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as CatalogSortKey)}
              aria-label="Sort products"
              data-testid="catalog-sort-select"
              className={styles.sortSelect}
            >
              {CATALOG_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {mode === "global" ? (
        <div className={styles.groupRow} role="tablist" aria-label="Filter by product group" data-testid="catalog-category-filter">
          {CATALOG_GROUP_OPTIONS.map((option) => {
            const isActive = group === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-testid={`catalog-group-${option.value}`}
                className={cn(styles.groupChip, isActive && styles.groupChipActive)}
                onClick={() => onGroupChange(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className={styles.metaRow}>
        <span className={styles.metaCount} data-testid="catalog-result-count">
          {resultLabel}
        </span>
      </div>
    </>
  );
}
