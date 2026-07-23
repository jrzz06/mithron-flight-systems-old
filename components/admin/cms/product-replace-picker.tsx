"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { ShelfSlotProductItem } from "@/lib/admin/shelf-slot-product";
import { catalogCategoryDefinitions } from "@/lib/catalog-category-taxonomy";
import { cn, formatINR } from "@/lib/utils";

export type ProductReplaceItem = ShelfSlotProductItem;

const RECENT_KEY = "mithron:cms-recent-products";
const PAGE_SIZE = 20;

const TAXONOMY_CATEGORY_LABELS = catalogCategoryDefinitions.map((definition) => definition.label);

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

function filterBrowseFallback(items: ProductReplaceItem[], query: string, category: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedCategory = category.trim().toLowerCase();

  return items.filter((item) => {
    const haystack = [item.name, item.slug, item.sku, item.category, item.brand].join(" ").toLowerCase();
    if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
    if (normalizedCategory && !item.category.toLowerCase().includes(normalizedCategory)) return false;
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

type CatalogPageResponse = {
  products: ProductReplaceItem[];
  hasMore?: boolean;
  nextOffset?: number;
};

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
  const [products, setProducts] = useState<ProductReplaceItem[]>([]);
  const [recent, setRecent] = useState<ProductReplaceItem[]>([]);
  const [currentProduct, setCurrentProduct] = useState<ProductReplaceItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const [entered, setEntered] = useState(false);
  const requestIdRef = useRef(0);

  const categoryOptions = useMemo(() => {
    const labels = new Set(TAXONOMY_CATEGORY_LABELS);
    for (const item of browseCatalog) {
      const value = item.category?.trim();
      if (value) labels.add(value);
    }
    const hint = (categoryFilter ?? shelfCategoryHint ?? "").trim();
    if (hint) labels.add(hint);
    return Array.from(labels).sort((a, b) => a.localeCompare(b));
  }, [browseCatalog, categoryFilter, shelfCategoryHint]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    setCategory(categoryFilter ?? shelfCategoryHint ?? "");
    setQuery("");
    setProducts([]);
    setError(null);
    setHasMore(false);
    setNextOffset(0);
    setUseFallback(false);
    setCurrentProduct(null);
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [categoryFilter, open, shelfCategoryHint]);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const requestId = ++requestIdRef.current;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
        setUseFallback(false);
      }

      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
          includeDrafts: "true",
          q: query,
          category
        });
        const response = await fetch(`/api/admin/catalog/products?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Could not load catalog.");
        }
        const payload = (await response.json()) as CatalogPageResponse;
        if (requestId !== requestIdRef.current) return;

        const page = payload.products ?? [];
        setProducts((prev) => (append ? [...prev, ...page] : page));
        setHasMore(Boolean(payload.hasMore));
        setNextOffset(payload.nextOffset ?? offset + page.length);

        if (!append && page.length === 0) {
          setUseFallback(true);
        }
      } catch {
        if (requestId !== requestIdRef.current) return;
        if (!append) {
          setProducts([]);
          setHasMore(false);
          setNextOffset(0);
          setUseFallback(true);
          setError("Could not load catalog. Showing local browse list if available.");
        } else {
          setError("Could not load more products. Try again.");
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [category, query]
  );

  const loadRecent = useCallback(async () => {
    const slugs = readRecentSlugs();
    if (!slugs.length) {
      setRecent([]);
      return;
    }
    const params = new URLSearchParams({ slugs: slugs.join(","), includeDrafts: "true", limit: "12" });
    const response = await fetch(`/api/admin/catalog/products?${params.toString()}`);
    if (!response.ok) return;
    const payload = (await response.json()) as CatalogPageResponse;
    setRecent(payload.products ?? []);
  }, []);

  const loadCurrent = useCallback(async () => {
    if (!currentSlug) {
      setCurrentProduct(null);
      return;
    }
    const params = new URLSearchParams({ slugs: currentSlug, includeDrafts: "true" });
    const response = await fetch(`/api/admin/catalog/products?${params.toString()}`);
    if (!response.ok) {
      const fallback = browseCatalog.find((item) => item.slug === currentSlug) ?? null;
      setCurrentProduct(fallback);
      return;
    }
    const payload = (await response.json()) as CatalogPageResponse;
    setCurrentProduct(payload.products?.[0] ?? browseCatalog.find((item) => item.slug === currentSlug) ?? null);
  }, [browseCatalog, currentSlug]);

  useEffect(() => {
    if (!open) return;
    void loadRecent();
    void loadCurrent();
    const timer = window.setTimeout(() => void fetchPage(0, false), 250);
    return () => window.clearTimeout(timer);
  }, [fetchPage, loadCurrent, loadRecent, open]);

  const fallbackResults = useMemo(() => {
    if (!useFallback) return [] as ProductReplaceItem[];
    return sortByShelfHint(filterBrowseFallback(browseCatalog, query, category), shelfCategoryHint);
  }, [browseCatalog, category, query, shelfCategoryHint, useFallback]);

  const sourceResults = useMemo(() => {
    const base = useFallback ? fallbackResults : products;
    const seen = new Set<string>();
    const merged: ProductReplaceItem[] = [];
    for (const item of base) {
      if (seen.has(item.slug)) continue;
      seen.add(item.slug);
      merged.push(item);
    }
    return sortByShelfHint(merged, shelfCategoryHint);
  }, [fallbackResults, products, shelfCategoryHint, useFallback]);

  const visibleResults = useMemo(() => {
    const filtered = sourceResults.filter((item) => !excludeSlugs.includes(item.slug));
    if (!currentSlug || !currentProduct) return filtered;
    if (excludeSlugs.includes(currentSlug)) return filtered;
    return [currentProduct, ...filtered.filter((item) => item.slug !== currentSlug)];
  }, [currentProduct, currentSlug, excludeSlugs, sourceResults]);

  const handleSelect = (item: ProductReplaceItem) => {
    writeRecentSlug(item.slug);
    onSelect(item);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 transition-opacity duration-200 sm:items-center",
        entered ? "opacity-100" : "opacity-0"
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "flex max-h-[85dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--platform-border)] bg-[var(--platform-surface)] shadow-xl transition-all duration-200",
          entered ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-[0.98] opacity-0 sm:translate-y-2"
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--platform-border)] px-5 py-4">
          <h3 className="text-base font-semibold text-[var(--platform-text-primary)]">{title}</h3>
          <button type="button" onClick={onClose} className="platform-btn-ghost platform-btn-sm" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="border-b border-[var(--platform-border)] px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
            <label className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--platform-text-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, SKU, category, brand…"
                autoFocus
                className="h-11 w-full rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] pl-10 pr-3 text-sm"
              />
            </label>
            <label className="min-w-0">
              <span className="sr-only">Category</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-11 w-full rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 text-sm"
              >
                <option value="">All categories</option>
                {categoryOptions.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {recent.length ? (
          <div className="border-b border-[var(--platform-border)] px-5 py-3">
            <p className="mb-2 type-meta font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
              Recently used
            </p>
            <ul className="grid gap-1">
              {recent
                .filter((item) => !excludeSlugs.includes(item.slug))
                .map((item) => (
                  <ProductRow key={`recent-${item.slug}`} item={item} onSelect={() => handleSelect(item)} />
                ))}
            </ul>
          </div>
        ) : null}

        <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--platform-text-secondary)]">
              {loading
                ? "Loading catalog…"
                : useFallback
                  ? `Showing ${visibleResults.length} from browse list`
                  : `Showing ${visibleResults.length} product${visibleResults.length === 1 ? "" : "s"}`}
            </p>
            {error ? (
              <button type="button" onClick={() => void fetchPage(0, false)} className="text-sm font-semibold text-[var(--platform-accent)]">
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
                onSelect={() => handleSelect(item)}
              />
            ))}
          </ul>

          {!useFallback && hasMore ? (
            <div className="mt-4 border-t border-[var(--platform-border)] pt-4">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void fetchPage(nextOffset, true)}
                className="platform-btn-secondary platform-btn-sm w-full"
              >
                {loadingMore ? "Loading more…" : "Load more"}
              </button>
            </div>
          ) : null}
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
              <span className="rounded-full bg-[var(--platform-accent-soft)] px-2 py-0.5 type-badge font-semibold uppercase tracking-wide text-[var(--platform-accent)]">
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
          <p className={cn("type-badge font-semibold uppercase tracking-wide", item.available ? "text-emerald-700" : "text-amber-700")}>
            {item.available ? "In stock" : "Unavailable"}
          </p>
        </div>
      </button>
    </li>
  );
}
