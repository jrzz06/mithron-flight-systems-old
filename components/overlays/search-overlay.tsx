"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowRight, Search, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { buildProductsCatalogHref } from "@/lib/catalog-product-listing";
import { SEARCH_QUICK_LINKS } from "@/lib/catalog-search-popular";
import { categoryMatchesSearchQuery } from "@/lib/product-search-engine";
import {
  searchCatalogIndex,
  suggestCatalogCategories,
  type CatalogSearchIndexEntry
} from "@/lib/catalog-search-index";
import { catalogCategoryDefinitions } from "@/lib/catalog-categories";
import { ProductCardImage } from "@/components/media/product-card-image";
import { rememberRecentSearch } from "@/lib/search-recent";
import { SearchHighlight } from "@/lib/search-highlight";
import { SEARCH_DEBOUNCE_MS, mergeSearchResultsBySlug } from "@/lib/search-query";
import type { CatalogSearchResult } from "@/services/catalog";
import { useUiStore } from "@/store/ui";
import { cn, formatINR } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import styles from "./search-overlay.module.css";

type IndexResponse = {
  index?: CatalogSearchIndexEntry[];
  error?: string;
};

type SearchResponse = {
  query: string;
  results: CatalogSearchResult[];
  error?: string;
};

const RESULT_ROW_HEIGHT = 68;
const RESULT_ROW_GAP = 6;
const SEARCH_REMOTE_RESULT_LIMIT = 24;

let cachedCatalogSearchIndex: CatalogSearchIndexEntry[] | null = null;
let catalogSearchIndexPromise: Promise<CatalogSearchIndexEntry[]> | null = null;

function loadCatalogSearchIndex(): Promise<CatalogSearchIndexEntry[]> {
  if (cachedCatalogSearchIndex) {
    return Promise.resolve(cachedCatalogSearchIndex);
  }

  if (!catalogSearchIndexPromise) {
    catalogSearchIndexPromise = fetchWithTimeout("/api/catalog/search?intent=index", {
      cache: "force-cache"
    })
      .then(async (response) => {
        const payload = (await response.json()) as IndexResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "Search is temporarily unavailable.");
        }
        const index = payload.index ?? [];
        cachedCatalogSearchIndex = index;
        return index;
      })
      .finally(() => {
        catalogSearchIndexPromise = null;
      });
  }

  return catalogSearchIndexPromise;
}

function useResultColumns() {
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const sync = () => setColumns(media.matches ? 2 : 1);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return columns;
}

function SearchResultSkeletons() {
  return (
    <div className={styles.skeletonGrid} aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className={styles.skeletonCard} />
      ))}
    </div>
  );
}

const SearchResultCard = memo(function SearchResultCard({
  product,
  highlightQuery,
  active,
  open,
  tabIndex,
  onOpen,
  onRef,
  id
}: {
  product: CatalogSearchResult;
  highlightQuery: string;
  active: boolean;
  open: boolean;
  tabIndex: number;
  onOpen: (product: CatalogSearchResult) => void;
  onRef: (node: HTMLAnchorElement | null) => void;
  id?: string;
}) {
  return (
    <Link
      ref={onRef}
      id={id}
      href={`/product/${product.slug}`}
      title={`View ${product.name}`}
      tabIndex={open ? tabIndex : -1}
      onClick={(event) => {
        event.preventDefault();
        onOpen(product);
      }}
      className={cn(styles.resultCard, active && styles.resultCardActive)}
    >
      <span className={styles.thumb}>
        <ProductCardImage
          product={product}
          fill
          priority={false}
          sizes="52px"
          className="object-contain p-1.5"
          placeholderClassName={styles.thumbPlaceholder}
        />
      </span>
      <span className={styles.meta}>
        <span className={styles.title}>
          <SearchHighlight text={product.name} query={highlightQuery} className={styles.highlight} />
        </span>
        <span className={styles.footer}>
          <span className={styles.price}>From {formatINR(product.price)}</span>
          <span className={styles.quickAction}>
            View
            <ArrowRight className="size-3" aria-hidden="true" />
          </span>
        </span>
      </span>
    </Link>
  );
});

function VirtualSearchResults({
  products,
  highlightQuery,
  activeResultIndex,
  open,
  scrollRef,
  resultRefs,
  onOpen
}: {
  products: CatalogSearchResult[];
  highlightQuery: string;
  activeResultIndex: number;
  open: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  resultRefs: React.MutableRefObject<Array<HTMLAnchorElement | null>>;
  onOpen: (product: CatalogSearchResult) => void;
}) {
  const columns = useResultColumns();
  const rowCount = Math.ceil(products.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => RESULT_ROW_HEIGHT + RESULT_ROW_GAP,
    overscan: 4
  });

  useEffect(() => {
    if (activeResultIndex < 0) return;
    const rowIndex = Math.floor(activeResultIndex / columns);
    rowVirtualizer.scrollToIndex(rowIndex, { align: "auto" });
  }, [activeResultIndex, columns, rowVirtualizer]);

  useEffect(() => {
    rowVirtualizer.measure();
  }, [products.length, columns, scrollRef, rowVirtualizer]);

  return (
    <div
      id="search-results-list"
      className={styles.virtualList}
      role="listbox"
      style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
    >
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const startIndex = virtualRow.index * columns;
        const rowProducts = products.slice(startIndex, startIndex + columns);

        return (
          <div
            key={virtualRow.key}
            className={styles.virtualRow}
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            <ul className={styles.resultList}>
              {rowProducts.map((product, columnIndex) => {
                const productIndex = startIndex + columnIndex;
                return (
                  <li key={product.slug} role="option" aria-selected={activeResultIndex === productIndex}>
                    <SearchResultCard
                      product={product}
                      highlightQuery={highlightQuery}
                      active={activeResultIndex === productIndex}
                      open={open}
                      tabIndex={0}
                      onOpen={onOpen}
                      id={`search-result-${productIndex}`}
                      onRef={(node) => {
                        resultRefs.current[productIndex] = node;
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function SearchOverlay() {
  const router = useRouter();
  const overlay = useUiStore((state) => state.overlay);
  const setOverlay = useUiStore((state) => state.setOverlay);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [catalogIndex, setCatalogIndex] = useState<CatalogSearchIndexEntry[]>(
    () => cachedCatalogSearchIndex ?? []
  );
  const [indexReady, setIndexReady] = useState(() => Boolean(cachedCatalogSearchIndex));
  const [remoteResults, setRemoteResults] = useState<CatalogSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const resultRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  const open = overlay === "search";
  useBodyScrollLock(open);
  const activeQuery = query.trim();
  const hasActiveQuery = activeQuery.length > 0;

  useEffect(() => {
    if (!hasActiveQuery) {
      setDebouncedQuery("");
      return;
    }

    const timer = window.setTimeout(() => setDebouncedQuery(activeQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [activeQuery, hasActiveQuery]);

  const localResults = useMemo(
    () => (debouncedQuery && catalogIndex.length ? searchCatalogIndex(catalogIndex, debouncedQuery, 24) : []),
    [catalogIndex, debouncedQuery]
  );

  const visibleProducts = useMemo(() => {
    if (!debouncedQuery) return [];
    return mergeSearchResultsBySlug(remoteResults, localResults, 24);
  }, [debouncedQuery, localResults, remoteResults]);

  const suggestedCategories = useMemo(() => {
    if (!debouncedQuery) return [];
    const fromIndex = suggestCatalogCategories(catalogIndex, debouncedQuery, 4);
    if (fromIndex.length) return fromIndex;

    return catalogCategoryDefinitions
      .filter((category) => categoryMatchesSearchQuery(category.label, debouncedQuery))
      .slice(0, 4)
      .map((category) => category.label);
  }, [catalogIndex, debouncedQuery]);

  const awaitingDebounced = hasActiveQuery && activeQuery !== debouncedQuery;
  const awaitingRemote = Boolean(debouncedQuery) && isSearching;
  const isLoading = !indexReady || awaitingDebounced || (awaitingRemote && !localResults.length);
  const showEmptyState = Boolean(debouncedQuery) && !isLoading && !visibleProducts.length;
  const highlightQuery = debouncedQuery || activeQuery;
  const statusLabel = isLoading
    ? "Searching..."
    : hasActiveQuery
      ? `${visibleProducts.length} result${visibleProducts.length === 1 ? "" : "s"}`
      : "Type to search products";

  const closeOverlay = useCallback(() => {
    setOverlay(null);
  }, [setOverlay]);

  const submitSearch = useCallback(
    (value = activeQuery) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      rememberRecentSearch(trimmed);
      setQuery("");
      setDebouncedQuery("");
      setRemoteResults([]);
      setSearchError(null);
      setIsSearching(false);
      setActiveResultIndex(-1);
      closeOverlay();
      window.setTimeout(() => {
        router.push(buildProductsCatalogHref({ q: trimmed }));
      }, 0);
    },
    [activeQuery, closeOverlay, router]
  );

  const openResult = useCallback(
    (product: CatalogSearchResult) => {
      rememberRecentSearch(product.name);
      setQuery("");
      setDebouncedQuery("");
      setRemoteResults([]);
      setSearchError(null);
      setIsSearching(false);
      setActiveResultIndex(-1);
      closeOverlay();
      // Defer navigation so overlay unmount / inert cleanup finish before route commit.
      window.setTimeout(() => {
        router.push(`/product/${product.slug}`);
      }, 0);
    },
    [closeOverlay, router]
  );

  useEffect(() => {
    if (!open) return;
    const focusInput = () => inputRef.current?.focus({ preventScroll: true });
    const raf = window.requestAnimationFrame(focusInput);
    const timer = window.setTimeout(focusInput, 220);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      document.documentElement.style.removeProperty("--search-header-bottom");
      return;
    }

    const panel = panelRef.current;
    if (!panel) return;

    const syncHeaderBottom = () => {
      // Use layout height (offsetHeight), not clipped getBoundingClientRect — clip-path
      // would otherwise pull the backdrop up while the sheet is still sliding open.
      const top = panel.getBoundingClientRect().top;
      const bottom = top + panel.offsetHeight;
      document.documentElement.style.setProperty("--search-header-bottom", `${Math.ceil(bottom)}px`);
    };

    syncHeaderBottom();
    const resizeObserver = new ResizeObserver(syncHeaderBottom);
    resizeObserver.observe(panel);
    window.addEventListener("resize", syncHeaderBottom);
    window.addEventListener("scroll", syncHeaderBottom, { passive: true });

    // Re-measure after the clip-path open transition settles.
    const settleTimer = window.setTimeout(syncHeaderBottom, 240);

    return () => {
      window.clearTimeout(settleTimer);
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncHeaderBottom);
      window.removeEventListener("scroll", syncHeaderBottom);
      document.documentElement.style.removeProperty("--search-header-bottom");
    };
  }, [open, hasActiveQuery, visibleProducts.length, isLoading]);

  useEffect(() => {
    if (!open) return;

    const main = document.getElementById("g-main");
    if (!main) return;

    // Defer inert so React can finish the open commit before the browser mutates focus trees.
    let applied = false;
    const raf = window.requestAnimationFrame(() => {
      main.setAttribute("inert", "");
      main.setAttribute("aria-hidden", "true");
      applied = true;
    });

    return () => {
      window.cancelAnimationFrame(raf);
      if (applied || main.hasAttribute("inert")) {
        main.removeAttribute("inert");
        main.removeAttribute("aria-hidden");
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let active = true;

    if (cachedCatalogSearchIndex) {
      setCatalogIndex(cachedCatalogSearchIndex);
      setIndexReady(true);
      return;
    }

    void loadCatalogSearchIndex()
      .then((index) => {
        if (!active) return;
        setCatalogIndex(index);
        setIndexReady(true);
        setSearchError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setIndexReady(true);
        setSearchError(error instanceof Error ? error.message : "Search is temporarily unavailable.");
      });

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !debouncedQuery) {
      setRemoteResults([]);
      setIsSearching(false);
      return;
    }

    // Wait for the index so we can prefer local hits before hitting the RPC.
    if (!indexReady) {
      setIsSearching(true);
      return;
    }

    // Index-first: skip remote RPC when the local index already fills the result budget.
    if (catalogIndex.length > 0 && localResults.length >= SEARCH_REMOTE_RESULT_LIMIT) {
      setRemoteResults([]);
      setIsSearching(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setIsSearching(true);
    setSearchError(null);
    setActiveResultIndex(-1);

    void fetchWithTimeout(
      `/api/catalog/search?q=${encodeURIComponent(debouncedQuery)}&limit=${SEARCH_REMOTE_RESULT_LIMIT}`,
      {
        signal: controller.signal,
        cache: "no-store"
      },
      8_000
    )
      .then(async (response) => {
        const payload = (await response.json()) as SearchResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "Search failed.");
        }
        if (!active) return;
        setRemoteResults(payload.results ?? []);
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setSearchError(error instanceof Error ? error.message : "Search is temporarily unavailable.");
        setRemoteResults([]);
      })
      .finally(() => {
        if (active) setIsSearching(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [catalogIndex.length, debouncedQuery, indexReady, localResults.length, open]);

  useEffect(() => {
    setActiveResultIndex(-1);
    resultRefs.current = [];
  }, [debouncedQuery, visibleProducts.length]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeOverlay();
        return;
      }

      if (event.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;

        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement;

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
          return;
        }

        if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }

      if (!visibleProducts.length) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;

      const panelContainsTarget =
        event.target instanceof Node && panelRef.current?.contains(event.target);
      if (!panelContainsTarget) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveResultIndex((current) => {
          const next = current + 1 >= visibleProducts.length ? 0 : current + 1;
          resultRefs.current[next]?.focus();
          return next;
        });
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveResultIndex((current) => {
          const next = current <= 0 ? visibleProducts.length - 1 : current - 1;
          resultRefs.current[next]?.focus();
          return next;
        });
      }

      if (event.key === "Enter" && activeResultIndex >= 0) {
        event.preventDefault();
        const selected = visibleProducts[activeResultIndex];
        if (selected) openResult(selected);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeResultIndex, closeOverlay, open, openResult, visibleProducts]);

  const overlayNode = (
    <>
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        className={cn(styles.backdrop, open && styles.isOpen)}
        aria-label="Dismiss search overlay"
        onClick={closeOverlay}
      />
      <div
        ref={panelRef}
        className={cn(styles.sheet, open && styles.isOpen)}
        aria-hidden={!open}
        aria-label="Search products"
        aria-modal={open ? "true" : undefined}
        role="dialog"
      >
        <div className={styles.panel}>
          <div className={styles.inner}>
            <form
              className={styles.searchForm}
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                if (activeResultIndex >= 0 && visibleProducts[activeResultIndex]) {
                  openResult(visibleProducts[activeResultIndex]!);
                  return;
                }
                submitSearch();
              }}
            >
              <Search className={styles.searchIcon} strokeWidth={1.75} aria-hidden="true" />
              <input
                ref={inputRef}
                aria-label="Search Mithron products"
                aria-controls="search-results-list"
                aria-activedescendant={
                  activeResultIndex >= 0 ? `search-result-${activeResultIndex}` : undefined
                }
                name="q"
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search products..."
                tabIndex={open ? 0 : -1}
                className={styles.searchInput}
              />
              <button
                tabIndex={open ? 0 : -1}
                aria-label="Close search"
                onClick={closeOverlay}
                type="button"
                className={styles.iconButton}
              >
                <X className="size-5" strokeWidth={1.75} />
              </button>
            </form>

            <div ref={scrollRef} className={styles.scrollRegion}>
              <div className={styles.content}>
                {hasActiveQuery ? (
                  <>
                    <div className={styles.resultsHeader}>
                      <p className={styles.status} aria-live="polite" aria-atomic="true">
                        {statusLabel}
                      </p>
                      {awaitingRemote && localResults.length ? (
                        <p className={styles.statusSubtle} aria-live="polite">
                          Refining...
                        </p>
                      ) : null}
                    </div>

                    {isLoading ? <SearchResultSkeletons /> : null}

                    {!isLoading && visibleProducts.length ? (
                      <>
                        <VirtualSearchResults
                          products={visibleProducts}
                          highlightQuery={highlightQuery}
                          activeResultIndex={activeResultIndex}
                          open={open}
                          scrollRef={scrollRef}
                          resultRefs={resultRefs}
                          onOpen={openResult}
                        />
                        {debouncedQuery.length >= 2 ? (
                          <Link
                            href={buildProductsCatalogHref({ q: debouncedQuery })}
                            className={styles.viewAll}
                            onClick={() => {
                              rememberRecentSearch(debouncedQuery);
                              closeOverlay();
                            }}
                          >
                            View all results
                          </Link>
                        ) : null}
                      </>
                    ) : null}

                    {showEmptyState ? (
                      <div className={searchError ? styles.errorState : styles.emptyState}>
                        <p className={styles.emptyTitle}>
                          {searchError ? "Search unavailable" : "No exact match"}
                        </p>
                        <p className={styles.emptyCopy}>
                          {searchError ??
                            "Try agriculture, mapping, G-HADRON, controller, battery, or site monitoring."}
                        </p>
                        {suggestedCategories.length ? (
                          <div className={styles.sectionBlock}>
                            <p className={styles.sectionHeading}>Suggested categories</p>
                            <div className={styles.linkList}>
                              {suggestedCategories.map((category) => {
                                const definition = catalogCategoryDefinitions.find(
                                  (item) =>
                                    item.label === category || item.categoryNames.includes(category)
                                );
                                if (!definition) {
                                  return (
                                    <button
                                      key={category}
                                      type="button"
                                      className={styles.linkRow}
                                      onClick={() => setQuery(category)}
                                    >
                                      {category}
                                    </button>
                                  );
                                }

                                return (
                                  <Link
                                    key={category}
                                    href={definition.href}
                                    className={styles.linkRow}
                                    onClick={closeOverlay}
                                  >
                                    {definition.label}
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                        <Link
                          href={buildProductsCatalogHref({ q: debouncedQuery })}
                          className={styles.viewAll}
                          onClick={() => {
                            rememberRecentSearch(debouncedQuery);
                            closeOverlay();
                          }}
                        >
                          View all results
                        </Link>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className={styles.idlePanel}>
                    <div className={styles.sectionBlock}>
                      <p className={styles.sectionHeading}>Categories</p>
                      <div className={styles.linkList}>
                        {catalogCategoryDefinitions.map((definition) => (
                          <Link
                            key={definition.href}
                            href={definition.href}
                            className={styles.linkRow}
                            onClick={closeOverlay}
                          >
                            {definition.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                    <div className={styles.sectionBlock}>
                      <p className={styles.sectionHeading}>Quick Links</p>
                      <div className={styles.linkList}>
                        {SEARCH_QUICK_LINKS.map((item) => (
                          <button
                            key={item}
                            type="button"
                            className={styles.linkRow}
                            onClick={() => setQuery(item)}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return overlayNode;
}
