import {
  resolveCanonicalProductCategory,
  type CatalogCategoryDefinition
} from "@/lib/catalog-category-taxonomy";

export type ProductCategoryOption = {
  label: string;
  routeKey: string | null;
  productCount: number;
  metadataBacked: boolean;
};

function categoryKey(value: string) {
  return value.trim().toLowerCase();
}

export function buildProductCategoryOptions(
  products: Array<Record<string, unknown>>,
  categories: Array<Record<string, unknown>>
): ProductCategoryOption[] {
  const productCounts = new Map<string, { label: string; count: number }>();
  products.forEach((product) => {
    const value = product.category;
    if (typeof value !== "string" || !value.trim()) return;
    const canonical = resolveCanonicalProductCategory(value);
    const key = categoryKey(canonical);
    const current = productCounts.get(key);
    productCounts.set(key, {
      // Prefer Title Case canonical when known; otherwise keep first seen spelling.
      label: current?.label ?? canonical,
      count: (current?.count ?? 0) + 1
    });
  });

  const byLabel = new Map<string, ProductCategoryOption>();
  categories.forEach((category) => {
    const rawTitle = typeof category.title === "string" ? category.title.trim() : "";
    if (!rawTitle) return;
    const label = resolveCanonicalProductCategory(rawTitle);
    const key = categoryKey(label);
    const productCount = productCounts.get(key)?.count ?? 0;
    byLabel.set(key, {
      label,
      routeKey: typeof category.route_key === "string" && category.route_key.trim() ? category.route_key.trim() : null,
      productCount,
      metadataBacked: true
    });
  });

  productCounts.forEach((value, key) => {
    if (byLabel.has(key)) return;
    byLabel.set(key, {
      label: value.label,
      routeKey: null,
      productCount: value.count,
      metadataBacked: false
    });
  });

  return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function ensureCategoryInOptions(
  options: ProductCategoryOption[],
  defaultCategory?: string
): ProductCategoryOption[] {
  const trimmedDefault = defaultCategory?.trim();
  if (!trimmedDefault) return options;

  const canonical = resolveCanonicalProductCategory(trimmedDefault);
  const hasMatch = options.some((option) => categoryKey(option.label) === categoryKey(canonical));
  if (hasMatch) return options;

  return [
    {
      label: canonical,
      routeKey: null,
      productCount: 0,
      metadataBacked: false
    },
    ...options
  ];
}

export function preferCanonicalCategoryLabel(
  label: string,
  definitions?: CatalogCategoryDefinition[]
): string {
  return resolveCanonicalProductCategory(label);
}
