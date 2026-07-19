"use client";

import Image from "next/image";
import { useCallback, useMemo, useRef, useState } from "react";
import { Replace, Trash2 } from "lucide-react";
import { CmsAssignmentSourceBadge } from "@/components/admin/cms/cms-assignment-source-badge";
import { ProductReplacePicker, type ProductReplaceItem } from "@/components/admin/cms/product-replace-picker";
import type { SlotAssignmentSource } from "@/lib/cms/homepage-slot-assignment";
import { padShelfSlugs } from "@/lib/home/shelf-product-resolution";
import { formatINR } from "@/lib/utils";

const REMOTE_CACHE_LIMIT = 64;

function setRemoteCacheItem(cache: Map<string, ProductReplaceItem>, item: ProductReplaceItem) {
  if (cache.has(item.slug)) cache.delete(item.slug);
  cache.set(item.slug, item);
  while (cache.size > REMOTE_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function ProductPositionCard({
  position,
  slug,
  product,
  source,
  onClear,
  onReplace
}: {
  position: number;
  slug: string;
  product?: ProductReplaceItem;
  source: SlotAssignmentSource;
  onClear: () => void;
  onReplace: () => void;
}) {
  const missingSelected = Boolean(slug) && !product;

  return (
    <div
      className="relative grid gap-3 overflow-visible rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4"
      data-cms-shelf-slot={position}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-[var(--platform-text-primary)]">Position {position}</p>
          <CmsAssignmentSourceBadge source={source} />
          {missingSelected ? (
            <span className="rounded-[6px] border border-red-300 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-800">
              Unavailable
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onReplace}
            className="platform-btn-secondary platform-btn-sm inline-flex items-center gap-1.5"
            data-cms-shelf-replace
          >
            <Replace className="size-3.5" aria-hidden="true" />
            {slug ? "Replace product" : "Choose product"}
          </button>
          {slug ? (
            <button
              type="button"
              onClick={onClear}
              className="platform-btn-ghost platform-btn-sm inline-flex items-center gap-1.5 text-[var(--platform-text-muted)]"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {product ? (
        <div className="flex min-w-0 items-center gap-3 rounded-[8px] bg-[var(--platform-surface-muted)] p-3">
          <div className="relative size-14 shrink-0 overflow-hidden rounded-[7px] bg-white">
            {product.imageSrc ? (
              <Image src={product.imageSrc} alt="" fill sizes="56px" className="object-contain p-1" />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--platform-text-primary)]">{product.name}</p>
            <p className="truncate text-xs text-[var(--platform-text-secondary)]">
              {product.sku} · {product.category}
              {typeof product.stock === "number" ? ` · stock ${product.stock}` : ""}
            </p>
            <p className="text-xs font-semibold text-[var(--platform-text-primary)]">{formatINR(product.price)}</p>
          </div>
        </div>
      ) : missingSelected ? (
        <p className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          Selected slug <code className="font-mono">{slug}</code> is missing or unpublished. Pick another product.
        </p>
      ) : (
        <p className="rounded-[8px] border border-dashed border-[var(--platform-border)] px-3 py-4 text-center text-xs text-[var(--platform-text-muted)]">
          No product in this slot yet.
        </p>
      )}
    </div>
  );
}

export function ShelfProductReplaceEditor({
  slotCount,
  selectedSlugs,
  initialSlotProducts = [],
  browseCatalog = [],
  shelfCategoryHint,
  isInferredAssignment = false,
  slotSources,
  onChange,
  onProductsChange,
  onSyncWarning,
  label = "Homepage products"
}: {
  slotCount: number;
  selectedSlugs: string[];
  initialSlotProducts?: Array<ProductReplaceItem | null>;
  browseCatalog?: ProductReplaceItem[];
  shelfCategoryHint?: string;
  isInferredAssignment?: boolean;
  slotSources?: SlotAssignmentSource[];
  onChange: (slugs: string[]) => void;
  onProductsChange?: (products: ProductReplaceItem[]) => void;
  onSyncWarning?: (message: string | null) => void;
  label?: string;
}) {
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const remoteCache = useRef(new Map<string, ProductReplaceItem>());

  const slots = useMemo(() => padShelfSlugs(selectedSlugs, slotCount), [selectedSlugs, slotCount]);

  const catalog = useMemo(() => {
    const bySlug = new Map<string, ProductReplaceItem>();
    for (const item of [...initialSlotProducts.filter(Boolean), ...browseCatalog] as ProductReplaceItem[]) {
      if (item.slug?.trim()) bySlug.set(item.slug, item);
    }
    for (const item of remoteCache.current.values()) {
      if (item.slug?.trim()) bySlug.set(item.slug, item);
    }
    return [...bySlug.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [browseCatalog, initialSlotProducts, selectedSlugs]);

  const bySlug = useMemo(() => new Map(catalog.map((item) => [item.slug, item])), [catalog]);
  const selectedProducts = useMemo(
    () => slots.map((slug) => bySlug.get(slug)).filter((item): item is ProductReplaceItem => Boolean(item)),
    [bySlug, slots]
  );

  const persistSlots = useCallback(
    (next: string[]) => {
      const padded = padShelfSlugs(next, slotCount);
      onChange(padded);
      const products = padded
        .map((slug) => bySlug.get(slug) ?? remoteCache.current.get(slug))
        .filter((item): item is ProductReplaceItem => Boolean(item));
      onProductsChange?.(products);
      const missing = padded.filter((slug) => slug && !bySlug.has(slug) && !remoteCache.current.has(slug));
      onSyncWarning?.(missing.length ? "Some assigned products are no longer available in the catalog." : null);
    },
    [bySlug, onChange, onProductsChange, onSyncWarning, slotCount]
  );

  return (
    <section data-cms-shelf-product-slots className="grid gap-4" aria-labelledby="homepage-product-slots-title">
      <div className="grid gap-1">
        <h3 id="homepage-product-slots-title" className="text-sm font-semibold text-[var(--platform-text-primary)]">
          {label}
        </h3>
        <p className="text-sm leading-relaxed text-[var(--platform-text-secondary)]">
          Choose exactly {slotCount} published products for this shelf. Use Replace to open the catalog picker.
        </p>
        {isInferredAssignment ? (
          <p className="rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            These products were selected automatically. Save to keep this order.
          </p>
        ) : null}
      </div>

      <input type="hidden" name="product_slugs" value={slots.filter(Boolean).join(",")} readOnly />

      <div className="grid gap-4">
        {slots.map((slug, index) => {
          const product = bySlug.get(slug) ?? remoteCache.current.get(slug);
          const source =
            slotSources?.[index] ?? (product ? (isInferredAssignment ? "inferred" : "pinned") : slug ? "missing" : "missing");

          return (
            <ProductPositionCard
              key={`product-slot-${index}`}
              position={index + 1}
              slug={slug}
              product={product}
              source={source}
              onClear={() => {
                const next = [...slots];
                next[index] = "";
                persistSlots(next);
              }}
              onReplace={() => setReplaceIndex(index)}
            />
          );
        })}
      </div>

      <p className="text-xs text-[var(--platform-text-muted)]" role="status">
        {selectedProducts.length} of {slotCount} positions selected.
      </p>

      <ProductReplacePicker
        open={replaceIndex !== null}
        onClose={() => setReplaceIndex(null)}
        currentSlug={replaceIndex !== null ? slots[replaceIndex] : undefined}
        excludeSlugs={slots.filter((_, i) => i !== replaceIndex).filter(Boolean)}
        shelfCategoryHint={shelfCategoryHint}
        browseCatalog={browseCatalog}
        onSelect={(item) => {
          if (replaceIndex === null) return;
          const next = [...slots];
          next[replaceIndex] = item.slug;
          setRemoteCacheItem(remoteCache.current, item);
          persistSlots(next);
          setReplaceIndex(null);
        }}
        title={
          replaceIndex !== null ? `Replace product in position ${replaceIndex + 1}` : "Replace product"
        }
      />
    </section>
  );
}
