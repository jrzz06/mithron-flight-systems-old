"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { ShelfSlotProductItem } from "@/lib/admin/shelf-slot-product";
import { formatINR } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type ProductReplaceItem = ShelfSlotProductItem;

const RECENT_KEY = "mithron:cms-recent-products";

function readRecentSlugs() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeRecentSlug(slug: string) {
  if (typeof window === "undefined" || !slug) return;
  const next = [slug, ...readRecentSlugs().filter((item) => item !== slug)].slice(0, 12);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function filterCatalogItems(
  items: ProductReplaceItem[],
  query: string,
  category: string,
  collection: string,
  brand: string,
  sku: string
) {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedCategory = category.trim().toLowerCase();
  const normalizedCollection = collection.trim().toLowerCase();
  const normalizedBrand = brand.trim().toLowerCase();
  const normalizedSku = sku.trim().toLowerCase();

  return items.filter((item) => {
    const haystack = [item.name, item.slug, item.sku, item.category, item.brand].join(" ").toLowerCase();
    if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
    if (normalizedCategory && !item.category.toLowerCase().includes(normalizedCategory)) return false;
    if (normalizedCollection && !haystack.includes(normalizedCollection)) return false;
    if (normalizedBrand && !item.brand.toLowerCase().includes(normalizedBrand)) return false;
    if (normalizedSku && !item.sku.toLowerCase().includes(normalizedSku)) return false;
    return true;
  });
}

function sortByShelfHint(items: ProductReplaceItem[], shelfCategoryHint?: string) {
  if (!shelfCategoryHint?.trim()) return items;
  const hint = shelfCategoryHint.trim().toLowerCase();
  return [...items].sort((a, b) => {
    const aMatch = a.category.toLowerCase().includes(hint) ? 0 : 1;
    const bMatch = b.category.toLowerCase().includes(hint) ? 0 : 1;
    return aMatch - bMatch || a.name.localeCompare(b.name);
  });
}

export function ProductReplacePicker({
  open,
  onClose,
  onSelect,
  excludeSlugs = [],
  currentSlug,
  categoryFilter,
  shelfCategoryHint,
  browseCatalog = [],
  title = "Replace product"
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (product: ProductReplaceItem) => void;
  excludeSlugs?: string[];
  currentSlug?: string;
  categoryFilter?: string;
  shelfCategoryHint?: string;
  browseCatalog?: ProductReplaceItem[];
  title?: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(categoryFilter ?? "");
  const [collection, setCollection] = useState("");
  const [brand, setBrand] = useState("");
  const [sku, setSku] = useState("");
  const [apiResults, setApiResults] = useState<ProductReplaceItem[]>([]);
  const [recent, setRecent] = useState<ProductReplaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCategory(categoryFilter ?? shelfCategoryHint ?? "");
    setCollection("");
    setQuery("");
    setBrand("");
    setSku("");
    setApiResults([]);
    setError(null);
  }, [categoryFilter, open, shelfCategoryHint]);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: "40",
        includeDrafts: "true",
        q: query,
        category,
        brand,
        sku
      });
      const response = await fetch(`/api/admin/catalog/products?${params.toString()}`);
      if (!response.ok) {
        setError("Could not load catalog. Retry or use the browse list below.");
        return;
      }
      const payload = (await response.json()) as { products: ProductReplaceItem[] };
      setApiResults(payload.products ?? []);
    } catch {
      setError("Could not load catalog. Retry or use the browse list below.");
    } finally {
      setLoading(false);
    }
  }, [brand, category, query, sku]);

  const loadRecent = useCallback(async () => {
    const slugs = readRecentSlugs();
    if (!slugs.length) {
      setRecent([]);
      return;
    }
    const params = new URLSearchParams({ slugs: slugs.join(","), includeDrafts: "true", limit: "12" });
    const response = await fetch(`/api/admin/catalog/products?${params.toString()}`);
    if (!response.ok) return;
    const payload = (await response.json()) as { products: ProductReplaceItem[] };
    setRecent(payload.products ?? []);
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadRecent();
    const timer = window.setTimeout(() => void search(), 250);
    return () => window.clearTimeout(timer);
  }, [loadRecent, open, search]);

  const filteredBrowse = useMemo(
    () => sortByShelfHint(filterCatalogItems(browseCatalog, query, category, collection, brand, sku), shelfCategoryHint),
    [brand, browseCatalog, category, collection, query, shelfCategoryHint, sku]
  );

  const collectionOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of browseCatalog) {
      if (item.category.trim()) values.add(item.category.trim());
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [browseCatalog]);

  const mergedResults = useMemo(() => {
    const source = apiResults.length ? apiResults : filteredBrowse;
    const seen = new Set<string>();
    const merged: ProductReplaceItem[] = [];
    for (const item of source) {
      if (seen.has(item.slug)) continue;
      seen.add(item.slug);
      merged.push(item);
    }
    if (apiResults.length) {
      for (const item of filteredBrowse) {
        if (seen.has(item.slug)) continue;
        seen.add(item.slug);
        merged.push(item);
      }
    }
    return sortByShelfHint(merged, shelfCategoryHint);
  }, [apiResults, filteredBrowse, shelfCategoryHint]);

  const visibleResults = useMemo(() => {
    const filtered = mergedResults.filter((item) => !excludeSlugs.includes(item.slug));
    if (!currentSlug) return filtered;
    const current = [...mergedResults, ...browseCatalog].find((item) => item.slug === currentSlug);
    if (!current) return filtered;
    return [current, ...filtered.filter((item) => item.slug !== currentSlug)];
  }, [browseCatalog, currentSlug, excludeSlugs, mergedResults]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[85dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--platform-border)] bg-[var(--platform-surface)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--platform-border)] px-5 py-4">
          <h3 className="text-base font-semibold text-[var(--platform-text-primary)]">{title}</h3>
          <button type="button" onClick={onClose} className="platform-btn-ghost platform-btn-sm" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="border-b border-[var(--platform-border)] px-5 py-4">
          <div className="grid gap-3">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--platform-text-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, SKU, category, brand…"
                autoFocus
                className="h-11 w-full rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] pl-10 pr-3 text-sm"
              />
            </label>
            <div className="grid gap-2 md:grid-cols-4">
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Category"
                className="h-10 rounded-[10px] border border-[var(--platform-border)] px-3 text-sm"
              />
              <select
                value={collection}
                onChange={(event) => setCollection(event.target.value)}
                className="h-10 rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 text-sm"
              >
                <option value="">Collection</option>
                {collectionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <input
                value={brand}
                onChange={(event) => setBrand(event.target.value)}
                placeholder="Brand"
                className="h-10 rounded-[10px] border border-[var(--platform-border)] px-3 text-sm"
              />
              <input
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                placeholder="SKU"
                className="h-10 rounded-[10px] border border-[var(--platform-border)] px-3 text-sm"
              />
            </div>
          </div>
        </div>

        {recent.length ? (
          <div className="border-b border-[var(--platform-border)] px-5 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Recently used</p>
            <ul className="grid gap-1">
              {recent.filter((item) => !excludeSlugs.includes(item.slug)).map((item) => (
                <ProductRow
                  key={`recent-${item.slug}`}
                  item={item}
                  onSelect={() => {
                    writeRecentSlug(item.slug);
                    onSelect(item);
                    onClose();
                  }}
                />
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--platform-text-secondary)]">
              {loading ? "Searching catalog…" : `Showing ${visibleResults.length} product${visibleResults.length === 1 ? "" : "s"}`}
            </p>
            {error ? (
              <button type="button" onClick={() => void search()} className="text-sm font-semibold text-[var(--platform-accent)]">
                Retry
              </button>
            ) : null}
          </div>

          {error ? <p className="mb-3 text-sm text-amber-800">{error}</p> : null}

          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {loading && !visibleResults.length
              ? Array.from({ length: 6 }).map((_, index) => (
                  <li key={`skeleton-${index}`} className="h-16 animate-pulse rounded-[10px] bg-[var(--platform-surface-muted)]" />
                ))
              : null}
            {!loading && !visibleResults.length ? (
              <li className="grid min-h-[200px] place-items-center rounded-[10px] border border-dashed border-[var(--platform-border)] px-4 text-center text-sm text-[var(--platform-text-muted)]">
                No products match your search. Try a different keyword or clear the filters.
              </li>
            ) : null}
            {visibleResults.map((item) => (
              <ProductRow
                key={item.slug}
                item={item}
                isCurrent={item.slug === currentSlug}
                onSelect={() => {
                  writeRecentSlug(item.slug);
                  onSelect(item);
                  onClose();
                }}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ProductRow({
  item,
  onSelect,
  isCurrent = false
}: {
  item: ProductReplaceItem;
  onSelect: () => void;
  isCurrent?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-3 rounded-[10px] border bg-[var(--platform-surface-muted)] p-3 text-left transition hover:border-[var(--platform-accent)]/40",
          isCurrent ? "border-[var(--platform-accent)] ring-1 ring-[var(--platform-accent)]/30" : "border-[var(--platform-border)]"
        )}
      >
        <div className="relative size-14 shrink-0 overflow-hidden rounded-[8px] border border-[var(--platform-border)] bg-white">
          {item.imageSrc ? <Image src={item.imageSrc} alt="" fill sizes="56px" className="object-contain p-1" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-[var(--platform-text-primary)]">{item.name}</p>
            {isCurrent ? (
              <span className="rounded-full bg-[var(--platform-accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--platform-accent)]">
                Current
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-[var(--platform-text-muted)]">
            {item.sku} · {item.category}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-[var(--platform-text-primary)]">{formatINR(item.price)}</p>
          <p className={cn("text-[10px] font-semibold uppercase tracking-wide", item.available ? "text-emerald-700" : "text-amber-700")}>
            {item.available ? "In stock" : "Unavailable"}
          </p>
        </div>
      </button>
    </li>
  );
}
