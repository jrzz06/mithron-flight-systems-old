"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/notifications/confirm-dialog";
import {
  ensureCategoryInOptions,
  type ProductCategoryOption
} from "@/lib/product-category-options";
import { resolveCanonicalProductCategory } from "@/lib/catalog-category-taxonomy";

export type { ProductCategoryOption };

type ProductCategoryFieldProps = {
  categories: ProductCategoryOption[];
  defaultCategory?: string;
  variant?: "admin" | "supplier";
  deleteCategoryAction?: (formData: FormData) => void | Promise<void>;
};

function resolveInitialCategory(options: ProductCategoryOption[], defaultCategory?: string) {
  const trimmedDefault = defaultCategory?.trim();
  if (trimmedDefault) {
    const canonical = resolveCanonicalProductCategory(trimmedDefault);
    const exactMatch = options.find((category) => category.label === canonical);
    if (exactMatch) return exactMatch.label;
    const caseInsensitiveMatch = options.find(
      (category) => category.label.toLowerCase() === canonical.toLowerCase()
    );
    if (caseInsensitiveMatch) return caseInsensitiveMatch.label;
  }
  return options[0]?.label ?? "";
}

function normalizeCategories(categories: ProductCategoryOption[]) {
  const seen = new Set<string>();
  return categories
    .map((category) => ({
      ...category,
      label: resolveCanonicalProductCategory(category.label.trim()),
      routeKey: category.routeKey?.trim() || null
    }))
    .filter((category) => category.label)
    .filter((category) => {
      const key = category.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function ProductCategoryField({
  categories,
  deleteCategoryAction,
  defaultCategory,
  variant = "admin"
}: ProductCategoryFieldProps) {
  const categoryId = useId();
  const isSupplier = variant === "supplier";
  const options = useMemo(
    () => normalizeCategories(ensureCategoryInOptions(categories, defaultCategory)),
    [categories, defaultCategory]
  );
  const [selectedCategory, setSelectedCategory] = useState(() =>
    resolveInitialCategory(options, defaultCategory)
  );
  const selectedOption = options.find((category) => category.label === selectedCategory) ?? options[0] ?? null;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string>("");
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const usageLabel = selectedOption
    ? selectedOption.productCount === 1
      ? "1 product uses this"
      : `${selectedOption.productCount} products use this`
    : "No category selected";

  const selectClassName = isSupplier
    ? "rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-[var(--platform-text-primary)]"
    : "h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface-muted)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus:bg-[var(--platform-accent-soft)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]";

  const labelClassName = isSupplier
    ? "text-[var(--platform-text-secondary)]"
    : "text-xs font-medium text-[var(--platform-text-muted)]";

  return (
    <div
      data-product-category-field
      data-product-category-variant={variant}
      className={isSupplier ? "grid gap-1 text-sm" : "grid gap-2"}
    >
      <div className={isSupplier ? "grid gap-1" : "flex items-center justify-between gap-3"}>
        <label htmlFor={categoryId} className={labelClassName}>
          Category
        </label>
        {!isSupplier && deleteCategoryAction ? (
          <button
            type="submit"
            ref={deleteButtonRef}
            formAction={deleteCategoryAction}
            formNoValidate
            data-product-delete-category-action
            disabled={!selectedOption}
            onClick={(event) => {
              if (!selectedOption) {
                event.preventDefault();
                return;
              }
              const warning = selectedOption.productCount > 0
                ? `Category "${selectedOption.label}" is used by ${selectedOption.productCount} product(s), so deletion will be blocked until those products are moved. Continue?`
                : `Delete category "${selectedOption.label}" from category metadata?`;
              event.preventDefault();
              setConfirmMessage(warning);
              setConfirmOpen(true);
            }}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--platform-danger)] transition-colors hover:bg-[var(--platform-danger-soft)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Delete
          </button>
        ) : null}
      </div>
      <input type="hidden" name="category_route_key" value={selectedOption?.routeKey ?? ""} />
      {options.length ? (
        <select
          id={categoryId}
          name="category"
          required
          value={selectedCategory}
          onChange={(event) => setSelectedCategory(event.target.value)}
          className={selectClassName}
        >
          {options.map((category) => (
            <option key={category.label} value={category.label}>
              {category.label}
            </option>
          ))}
        </select>
      ) : isSupplier ? (
        <p className="rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-xs text-[var(--platform-text-muted)]">
          No categories are available yet. Contact support to add a category before publishing products.
        </p>
      ) : (
        <div className="rounded-[10px] bg-[var(--platform-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--platform-warning)]">
          No existing categories were returned. Add a category first, then return here to create the product.
        </div>
      )}
      {selectedOption ? (
        <p data-product-category-usage className="text-xs leading-5 text-[var(--platform-text-muted)]">
          {isSupplier
            ? `${usageLabel}. Categories are shared with the admin catalog.`
            : `${usageLabel}. Delete removes the CMS category row only after products are moved out.`}
        </p>
      ) : null}
      {!isSupplier && selectedOption && deleteCategoryAction ? (
        <ConfirmDialog
          open={confirmOpen}
          title="Delete category?"
          description={confirmMessage}
          confirmLabel="Delete"
          variant="danger"
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            const button = deleteButtonRef.current;
            if (button?.form) {
              button.form.requestSubmit(button);
            }
          }}
        />
      ) : null}
    </div>
  );
}
