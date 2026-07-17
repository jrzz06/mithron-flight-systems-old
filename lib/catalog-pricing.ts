import type { ProductDiscountType } from "@/lib/product-pricing";
import { roundInr } from "@/lib/currency";

export type CatalogPricingInput = {
  price: number | string | null | undefined;
  compare_at?: number | string | null;
  on_sale?: boolean | null;
  discount_type?: string | null;
  discount_value?: number | string | null;
};

export type ResolvedCatalogPricing = {
  salePrice: number;
  listPrice: number;
  compareAt: number | null;
  onSale: boolean;
  discountType: ProductDiscountType | null;
  discountValue: number | null;
  savings: number;
};

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Authoritative storefront pricing derived from the Supabase product record (admin editor source). */
export function resolveCatalogPricing(input: CatalogPricingInput): ResolvedCatalogPricing {
  const salePrice = roundInr(Math.max(0, toNumber(input.price)));
  const storedCompareAt = input.compare_at ? roundInr(toNumber(input.compare_at)) : null;
  const onSale = Boolean(input.on_sale) || (storedCompareAt !== null && storedCompareAt > salePrice);
  const listPrice = onSale && storedCompareAt ? storedCompareAt : salePrice;
  const compareAt = onSale && storedCompareAt && storedCompareAt > salePrice ? storedCompareAt : null;
  const discountType: ProductDiscountType | null =
    input.discount_type === "percent" ? "percent" : input.discount_type === "amount" ? "amount" : onSale ? "amount" : null;
  const storedDiscount = input.discount_value ? roundInr(toNumber(input.discount_value)) : 0;
  const derivedDiscount = compareAt ? roundInr(compareAt - salePrice) : 0;
  const discountValue = onSale ? (storedDiscount > 0 ? storedDiscount : derivedDiscount) : null;
  const savings = compareAt ? roundInr(Math.max(0, compareAt - salePrice)) : 0;

  return {
    salePrice,
    listPrice,
    compareAt,
    onSale,
    discountType: onSale ? discountType : null,
    discountValue: onSale ? discountValue : null,
    savings
  };
}

function assertValidCatalogSalePrice(salePrice: number, context = "product") {
  if (!Number.isFinite(salePrice) || salePrice < 0) {
    throw new Error(`Invalid ${context} sale price.`);
  }
}

export function syncStoredBundlePricing<T extends Record<string, unknown>>(
  bundles: T[] | null | undefined,
  pricing: ResolvedCatalogPricing
) {
  if (!bundles?.length) return bundles ?? null;
  return bundles.map((bundle) => ({
    ...bundle,
    price: pricing.salePrice,
    compareAt: pricing.compareAt ?? undefined
  }));
}

export function appendBundlePricingSync(fields: Record<string, unknown>, existing?: Record<string, unknown>) {
  if (
    fields.price === undefined
    && fields.compare_at === undefined
    && fields.on_sale === undefined
    && fields.discount_type === undefined
    && fields.discount_value === undefined
  ) {
    return fields;
  }

  const pricing = resolveCatalogPricing({
    price: (fields.price ?? existing?.price ?? 0) as number | string | null,
    compare_at: (fields.compare_at ?? existing?.compare_at) as number | string | null | undefined,
    on_sale: (fields.on_sale ?? existing?.on_sale) as boolean | null | undefined,
    discount_type: (fields.discount_type ?? existing?.discount_type) as string | null | undefined,
    discount_value: (fields.discount_value ?? existing?.discount_value) as number | string | null | undefined
  });

  const bundles = Array.isArray(fields.bundles) ? fields.bundles : existing?.bundles;
  if (Array.isArray(bundles) && bundles.length) {
    fields.bundles = syncStoredBundlePricing(bundles as Array<Record<string, unknown>>, pricing);
  }

  return fields;
}
