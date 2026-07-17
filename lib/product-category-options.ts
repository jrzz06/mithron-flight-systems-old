export type ProductCategoryOption = {
  label: string;
  routeKey: string | null;
  productCount: number;
  metadataBacked: boolean;
};

export function buildProductCategoryOptions(
  products: Array<Record<string, unknown>>,
  categories: Array<Record<string, unknown>>
): ProductCategoryOption[] {
  const productCounts = new Map<string, { label: string; count: number }>();
  products.forEach((product) => {
    const value = product.category;
    if (typeof value !== "string" || !value.trim()) return;
    const category = value.trim();
    const key = category.toLowerCase();
    const current = productCounts.get(key);
    productCounts.set(key, {
      label: current?.label ?? category,
      count: (current?.count ?? 0) + 1
    });
  });

  const byLabel = new Map<string, ProductCategoryOption>();
  categories.forEach((category) => {
    const title = typeof category.title === "string" ? category.title.trim() : "";
    if (!title) return;
    const key = title.toLowerCase();
    const productCount = productCounts.get(key)?.count ?? 0;
    byLabel.set(key, {
      label: title,
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

  return [...byLabel.values()];
}

export function ensureCategoryInOptions(
  options: ProductCategoryOption[],
  defaultCategory?: string
): ProductCategoryOption[] {
  const trimmedDefault = defaultCategory?.trim();
  if (!trimmedDefault) return options;

  const hasMatch = options.some((option) => option.label.toLowerCase() === trimmedDefault.toLowerCase());
  if (hasMatch) return options;

  return [
    {
      label: trimmedDefault,
      routeKey: null,
      productCount: 0,
      metadataBacked: false
    },
    ...options
  ];
}
