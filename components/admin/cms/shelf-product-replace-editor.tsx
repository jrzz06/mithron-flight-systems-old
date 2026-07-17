"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { CmsAssignmentSourceBadge } from "@/components/admin/cms/cms-assignment-source-badge";
import type { ProductReplaceItem } from "@/components/admin/cms/product-replace-picker";
import type { SlotAssignmentSource } from "@/lib/cms/homepage-slot-assignment";
import { padShelfSlugs } from "@/lib/home/shelf-product-resolution";
import { formatINR } from "@/lib/utils";

function normalized(value: string | undefined) {
  return String(value ?? "").trim().toLowerCase();
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
  const [queries, setQueries] = useState(() => Array.from({ length: slotCount }, () => ""));
  const slots = useMemo(() => padShelfSlugs(selectedSlugs, slotCount), [selectedSlugs, slotCount]);
  const catalog = useMemo(() => {
    const bySlug = new Map<string, ProductReplaceItem>();
    for (const item of [...initialSlotProducts.filter(Boolean), ...browseCatalog] as ProductReplaceItem[]) {
      bySlug.set(item.slug, item);
    }
    const categoryHint = normalized(shelfCategoryHint);
    return [...bySlug.values()].sort((left, right) => {
      const leftPreferred = categoryHint && normalized(left.category).includes(categoryHint) ? 1 : 0;
      const rightPreferred = categoryHint && normalized(right.category).includes(categoryHint) ? 1 : 0;
      if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;
      return left.name.localeCompare(right.name);
    });
  }, [browseCatalog, initialSlotProducts, shelfCategoryHint]);
  const bySlug = useMemo(() => new Map(catalog.map((item) => [item.slug, item])), [catalog]);
  const selectedProducts = useMemo(
    () => slots.map((slug) => bySlug.get(slug)).filter((item): item is ProductReplaceItem => Boolean(item)),
    [bySlug, slots]
  );

  const persistSlots = (next: string[]) => {
    const padded = padShelfSlugs(next, slotCount);
    onChange(padded);
    const products = padded.map((slug) => bySlug.get(slug)).filter((item): item is ProductReplaceItem => Boolean(item));
    onProductsChange?.(products);
    const missing = padded.filter((slug) => slug && !bySlug.has(slug));
    onSyncWarning?.(missing.length ? "Some assigned products are no longer available in the catalog." : null);
  };

  return (
    <section data-cms-shelf-product-slots className="grid gap-4" aria-labelledby="homepage-product-slots-title">
      <div className="grid gap-1">
        <h3 id="homepage-product-slots-title" className="text-sm font-semibold text-[var(--platform-text-primary)]">{label}</h3>
        <p className="text-sm leading-relaxed text-[var(--platform-text-secondary)]">
          Choose one published product for each homepage position. Products for this shelf appear first.
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
          const product = bySlug.get(slug);
          const source = slotSources?.[index] ?? (product ? (isInferredAssignment ? "inferred" : "pinned") : "missing");
          const query = normalized(queries[index]);
          const availableOptions = catalog.filter((item) => {
            if (!query) return true;
            return [item.name, item.sku, item.category, item.slug].some((value) => normalized(value).includes(query));
          });
          const usedElsewhere = new Set(slots.filter((value, slotIndex) => slotIndex !== index && value));

          return (
            <div key={`product-slot-${index}`} className="grid gap-3 rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-[var(--platform-text-primary)]">Position {index + 1}</p>
                  <CmsAssignmentSourceBadge source={source} />
                </div>
                {slug ? (
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...slots];
                      next[index] = "";
                      persistSlots(next);
                    }}
                    className="platform-btn-ghost platform-btn-sm inline-flex items-center gap-1.5 text-[var(--platform-text-muted)]"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Clear
                  </button>
                ) : null}
              </div>

              {product ? (
                <div className="flex min-w-0 items-center gap-3 rounded-[8px] bg-[var(--platform-surface-muted)] p-3">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-[7px] bg-white">
                    {product.imageSrc ? <Image src={product.imageSrc} alt="" fill sizes="56px" className="object-contain p-1" /> : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--platform-text-primary)]">{product.name}</p>
                    <p className="truncate text-xs text-[var(--platform-text-secondary)]">{product.sku} · {product.category}</p>
                    <p className="text-xs font-semibold text-[var(--platform-text-primary)]">{formatINR(product.price)}</p>
                  </div>
                </div>
              ) : null}

              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-[var(--platform-text-secondary)]">Search products</span>
                <span className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--platform-text-muted)]" aria-hidden="true" />
                  <input
                    type="search"
                    value={queries[index]}
                    onChange={(event) => {
                      const next = [...queries];
                      next[index] = event.target.value;
                      setQueries(next);
                    }}
                    placeholder="Name, SKU, category…"
                    className="w-full rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] py-2 pl-9 pr-3 text-sm text-[var(--platform-text-primary)] outline-none transition focus:border-[var(--platform-accent)] focus:ring-2 focus:ring-[var(--platform-accent-soft)]"
                  />
                </span>
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-[var(--platform-text-secondary)]">Product</span>
                <select
                  value={slug}
                  onChange={(event) => {
                    const next = [...slots];
                    next[index] = event.target.value;
                    persistSlots(next);
                  }}
                  className="w-full rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-sm text-[var(--platform-text-primary)] outline-none transition focus:border-[var(--platform-accent)] focus:ring-2 focus:ring-[var(--platform-accent-soft)]"
                >
                  <option value="">No product selected</option>
                  {availableOptions.map((item) => (
                    <option key={item.slug} value={item.slug} disabled={usedElsewhere.has(item.slug)}>
                      {item.name} · {item.sku} · {item.category}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-[var(--platform-text-muted)]" role="status">
        {selectedProducts.length} of {slotCount} positions selected.
      </p>
    </section>
  );
}
