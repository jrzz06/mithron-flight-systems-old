import type { Bundle } from "@/config/types";
import { resolveCatalogPricing } from "@/lib/catalog-pricing";
import { deriveProductSku } from "@/lib/product-sku";

export type PersistedCartItem = {
  productSlug: string;
  bundleId: string;
  quantity: number;
  variantId?: string;
};

export type CartPricingProductRow = {
  slug: string;
  name: string;
  price: number | string | null;
  compare_at?: number | string | null;
  on_sale?: boolean | null;
  discount_type?: string | null;
  discount_value?: number | string | null;
  category: string;
  charge_tax?: boolean | null;
  tax_group?: string | null;
  tax_rate?: number | string | null;
  tax_included?: boolean | null;
  bundles?: Bundle[] | null;
  image?: { src: string } | null;
  specs?: Record<string, string> | null;
};

export type ResolvedCartLine = PersistedCartItem & {
  productName: string;
  bundleName: string;
  unitPrice: number;
  compareAt: number | null;
  image: string;
  chargeTax?: boolean;
  taxGroup?: string;
  taxRate?: number;
  taxIncluded?: boolean;
  category?: string;
  sku?: string;
};

function readSku(row: CartPricingProductRow) {
  return row.specs?.SKU?.trim() || row.specs?.Sku?.trim() || deriveProductSku(row.slug);
}

function resolveBundleName(bundles: Bundle[] | null | undefined, bundleId: string, productName: string) {
  const match = bundles?.find((bundle) => bundle.id === bundleId);
  return match?.name?.trim() || productName;
}

export function resolveCartLine(
  item: PersistedCartItem,
  product: CartPricingProductRow
): ResolvedCartLine {
  const pricing = resolveCatalogPricing(product);
  if (pricing.salePrice < 0) {
    throw new Error(`Product ${product.slug} has invalid catalog pricing.`);
  }

  return {
    ...item,
    productName: product.name,
    bundleName: resolveBundleName(product.bundles, item.bundleId, product.name),
    unitPrice: pricing.salePrice,
    compareAt: pricing.compareAt,
    image: product.image?.src ?? "",
    chargeTax: product.charge_tax ?? undefined,
    taxGroup: product.tax_group ?? undefined,
    taxRate: product.tax_rate !== null && product.tax_rate !== undefined ? Number(product.tax_rate) : undefined,
    taxIncluded: product.tax_included ?? undefined,
    category: product.category,
    sku: readSku(product)
  };
}

export function resolveCartLines(
  items: PersistedCartItem[],
  products: CartPricingProductRow[]
): ResolvedCartLine[] {
  const catalog = new Map(products.map((product) => [product.slug, product]));
  const lines: ResolvedCartLine[] = [];

  for (const item of items) {
    const product = catalog.get(item.productSlug);
    if (!product) {
      throw new Error(`Product ${item.productSlug} is no longer available.`);
    }
    lines.push(resolveCartLine(item, product));
  }

  return lines;
}

export function toPersistedCartItem(item: {
  productSlug: string;
  bundleId: string;
  quantity: number;
  variantId?: string;
}): PersistedCartItem {
  return {
    productSlug: item.productSlug,
    bundleId: item.bundleId,
    quantity: item.quantity,
    ...(item.variantId ? { variantId: item.variantId } : {})
  };
}

export function stripPersistedCartItems(items: Array<PersistedCartItem & Record<string, unknown>>): PersistedCartItem[] {
  return items.map((item) => ({
    ...toPersistedCartItem({
      productSlug: String(item.productSlug ?? ""),
      bundleId: String(item.bundleId ?? "standard"),
      quantity: Math.max(1, Number(item.quantity ?? 1)),
      variantId: typeof item.variantId === "string" ? item.variantId : undefined
    }),
    ...(typeof item.productName === "string" && item.productName.trim()
      ? { productName: item.productName.trim() }
      : {}),
    ...(typeof item.bundleName === "string" && item.bundleName.trim()
      ? { bundleName: item.bundleName.trim() }
      : {}),
    ...(typeof item.image === "string" && item.image.trim() ? { image: item.image.trim() } : {})
  }));
}
