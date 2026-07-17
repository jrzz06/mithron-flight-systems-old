import type { WixProductSnapshot } from "../wix/catalog-client.ts";
import { normalizeCatalogName } from "../wix/catalog-normalize.ts";
import { deriveSaleFields } from "../product-reconcile/score-canonical.ts";
import { calculateProfitAndMargin } from "../product-pricing.ts";
import { roundInr } from "../currency.ts";

export type PricingAuditDbRow = {
  slug: string;
  name: string;
  price: number | string | null;
  compare_at?: number | string | null;
  on_sale?: boolean | null;
  discount_type?: string | null;
  discount_value?: number | string | null;
  cost_of_goods?: number | string | null;
  show_price_per_unit?: boolean | null;
  charge_tax?: boolean | null;
  tax_group?: string | null;
  tax_rate?: number | string | null;
  tax_included?: boolean | null;
  source_currency?: string | null;
  source_catalog_id?: string | null;
  source_url?: string | null;
  specs?: Record<string, string> | null;
  variants?: Array<Record<string, unknown>> | null;
  bundles?: Array<Record<string, unknown>> | null;
  is_visible?: boolean | null;
  merge_status?: string | null;
};

export type PricingMatchMethod =
  | "wix_product_id"
  | "source_catalog_id"
  | "sku"
  | "slug"
  | "name";

export type PricingMatchResult =
  | { status: "matched"; wix: WixProductSnapshot; method: PricingMatchMethod }
  | { status: "manual_review"; reason: string; candidates: string[] }
  | { status: "unmatched"; reason: string };

export type WixPricingTarget = {
  price: number;
  compare_at: number | null;
  on_sale: boolean;
  discount_type: "percent" | "amount" | null;
  discount_value: number | null;
  source_currency: string;
  is_visible: boolean;
  cost_of_goods: number | null;
};

export type PricingFieldChange = {
  field: string;
  previous: string | number | boolean | null;
  next: string | number | boolean | null;
};

export type PricingAuditEntry = {
  slug: string;
  name: string;
  sku: string | null;
  match_method: PricingMatchMethod | null;
  wix_slug: string | null;
  action: "update" | "skip_matched" | "manual_review" | "unmatched";
  reason: string;
  changes: PricingFieldChange[];
  margin: { previous: number | null; next: number | null };
  profit: { previous: number | null; next: number | null };
};

const INR = "INR";

function roundMoney(value: number) {
  return roundInr(value);
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numbersDiffer(left: number | string | null | undefined, right: number | string | null | undefined) {
  return Math.abs(toNumber(left) - toNumber(right)) > 0.009;
}

function nullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? roundMoney(parsed) : null;
}

export function extractDbSku(row: PricingAuditDbRow) {
  const specSku = row.specs?.SKU?.trim() || row.specs?.Sku?.trim();
  if (specSku) return specSku;
  for (const variant of row.variants ?? []) {
    const sku = String(variant.sku ?? "").trim();
    if (sku) return sku;
  }
  return null;
}

export function extractDbWixProductId(row: PricingAuditDbRow) {
  return row.specs?.["Product ID"]?.trim() || null;
}

export function deriveWixSlugFromDbRow(row: PricingAuditDbRow) {
  if (row.slug.startsWith("source-")) return row.slug.slice("source-".length);
  if (row.source_catalog_id?.startsWith("mithron-")) {
    return row.source_catalog_id.slice("mithron-".length);
  }
  return row.slug;
}

export function buildWixPricingIndexes(wixProducts: WixProductSnapshot[]) {
  const byWixProductId = new Map<string, WixProductSnapshot[]>();
  const bySourceCatalogId = new Map<string, WixProductSnapshot>();
  const bySku = new Map<string, WixProductSnapshot[]>();
  const bySlug = new Map<string, WixProductSnapshot>();
  const byName = new Map<string, WixProductSnapshot[]>();

  for (const product of wixProducts) {
    const idBucket = byWixProductId.get(product.wix_product_id) ?? [];
    idBucket.push(product);
    byWixProductId.set(product.wix_product_id, idBucket);

    bySourceCatalogId.set(product.source_catalog_id, product);
    bySlug.set(product.wix_slug, product);

    if (product.sku) {
      const skuBucket = bySku.get(product.sku) ?? [];
      skuBucket.push(product);
      bySku.set(product.sku, skuBucket);
    }
    for (const variant of product.rich.variants) {
      if (!variant.sku) continue;
      const skuBucket = bySku.get(variant.sku) ?? [];
      skuBucket.push(product);
      bySku.set(variant.sku, skuBucket);
    }

    const nameKey = normalizeCatalogName(product.name);
    const nameBucket = byName.get(nameKey) ?? [];
    nameBucket.push(product);
    byName.set(nameKey, nameBucket);
  }

  return { byWixProductId, bySourceCatalogId, bySku, bySlug, byName };
}

function uniqueProducts(products: WixProductSnapshot[]) {
  const seen = new Map<string, WixProductSnapshot>();
  for (const product of products) {
    seen.set(product.wix_product_id, product);
  }
  return [...seen.values()];
}

function resolveSingleMatch(
  products: WixProductSnapshot[],
  method: PricingMatchMethod
): PricingMatchResult {
  const unique = uniqueProducts(products);
  if (!unique.length) return { status: "unmatched", reason: `no_${method}_match` };
  if (unique.length > 1) {
    return {
      status: "manual_review",
      reason: `ambiguous_${method}`,
      candidates: unique.map((product) => product.wix_slug)
    };
  }
  return { status: "matched", wix: unique[0]!, method };
}

export function matchDbRowToWixPricing(
  row: PricingAuditDbRow,
  indexes: ReturnType<typeof buildWixPricingIndexes>
): PricingMatchResult {
  const wixProductId = extractDbWixProductId(row);
  if (wixProductId) {
    const match = resolveSingleMatch(indexes.byWixProductId.get(wixProductId) ?? [], "wix_product_id");
    if (match.status !== "unmatched") return match;
  }

  if (row.source_catalog_id && indexes.bySourceCatalogId.has(row.source_catalog_id)) {
    return {
      status: "matched",
      wix: indexes.bySourceCatalogId.get(row.source_catalog_id)!,
      method: "source_catalog_id"
    };
  }

  const sku = extractDbSku(row);
  if (sku) {
    const match = resolveSingleMatch(indexes.bySku.get(sku) ?? [], "sku");
    if (match.status !== "unmatched") return match;
  }

  const derivedSlug = deriveWixSlugFromDbRow(row);
  if (derivedSlug && indexes.bySlug.has(derivedSlug)) {
    return { status: "matched", wix: indexes.bySlug.get(derivedSlug)!, method: "slug" };
  }
  if (indexes.bySlug.has(row.slug)) {
    return { status: "matched", wix: indexes.bySlug.get(row.slug)!, method: "slug" };
  }

  const nameKey = normalizeCatalogName(row.name);
  const match = resolveSingleMatch(indexes.byName.get(nameKey) ?? [], "name");
  return match;
}

export function buildWixPricingTarget(wix: WixProductSnapshot): WixPricingTarget | null {
  if (wix.price < 0 || !Number.isFinite(wix.price)) return null;

  const derived = deriveSaleFields(wix.price, wix.compare_at);
  if (derived.compare_at !== null && derived.compare_at < derived.price) return null;

  return {
    price: roundMoney(derived.price),
    compare_at: derived.compare_at === null ? null : roundMoney(derived.compare_at),
    on_sale: derived.on_sale,
    discount_type: derived.discount_type,
    discount_value: derived.discount_value === null ? null : roundMoney(derived.discount_value),
    source_currency: (wix.currency ?? INR).toUpperCase(),
    is_visible: wix.visible,
    cost_of_goods: wix.cost_of_goods === null ? null : roundMoney(wix.cost_of_goods)
  };
}

function patchSourceListingBundlePrice(
  bundles: Array<Record<string, unknown>> | null | undefined,
  target: WixPricingTarget
) {
  const existing = Array.isArray(bundles) ? bundles : [];
  const index = existing.findIndex((bundle) => bundle?.id === "source-listing");
  if (index < 0) return null;

  const current = existing[index] ?? {};
  const nextBundle = {
    ...current,
    price: target.price,
    compareAt: target.compare_at ?? undefined
  };

  if (
    Number(current.price ?? 0) === Number(nextBundle.price)
    && Number(current.compareAt ?? 0) === Number(nextBundle.compareAt ?? 0)
  ) {
    return null;
  }

  const next = [...existing];
  next[index] = nextBundle;
  return next;
}

export function buildPricingPatch(row: PricingAuditDbRow, target: WixPricingTarget) {
  const patch: Record<string, unknown> = {};
  const changes: PricingFieldChange[] = [];

  const assign = (field: string, next: string | number | boolean | null, previous: string | number | boolean | null) => {
    if (previous === next) return;
    if (
      (typeof previous === "number" || typeof next === "number")
      && typeof previous !== "boolean"
      && typeof next !== "boolean"
    ) {
      if (!numbersDiffer(previous, next)) return;
    }
    patch[field] = next;
    changes.push({ field, previous, next });
  };

  assign("price", target.price, roundMoney(toNumber(row.price)));
  assign("compare_at", target.compare_at, nullableNumber(row.compare_at));
  assign("on_sale", target.on_sale, Boolean(row.on_sale));
  assign("discount_type", target.discount_type, row.discount_type ?? null);
  assign(
    "discount_value",
    target.discount_value,
    row.discount_value === null || row.discount_value === undefined ? null : roundMoney(toNumber(row.discount_value))
  );
  assign("source_currency", target.source_currency, row.source_currency ?? null);
  assign("is_visible", target.is_visible, row.is_visible ?? true);

  if (target.cost_of_goods !== null) {
    assign("cost_of_goods", target.cost_of_goods, nullableNumber(row.cost_of_goods));
  }

  const bundles = patchSourceListingBundlePrice(row.bundles, target);
  if (bundles) {
    const listingBundle = (row.bundles ?? []).find((bundle) => bundle?.id === "source-listing");
    patch.bundles = bundles;
    changes.push({
      field: "bundles.source-listing.price",
      previous: roundMoney(toNumber(listingBundle?.price as number | string | null | undefined)),
      next: target.price
    });
  }

  if (Object.keys(patch).length) {
    patch.updated_at = new Date().toISOString();
    patch.source_extracted_at = new Date().toISOString();
  }

  return { patch, changes };
}

export function auditProductPricing(
  row: PricingAuditDbRow,
  match: PricingMatchResult
): PricingAuditEntry {
  const base = {
    slug: row.slug,
    name: row.name,
    sku: extractDbSku(row),
    changes: [] as PricingFieldChange[],
    margin: { previous: null as number | null, next: null as number | null },
    profit: { previous: null as number | null, next: null as number | null }
  };

  if (match.status === "manual_review") {
    return {
      ...base,
      match_method: null,
      wix_slug: null,
      action: "manual_review",
      reason: match.reason
    };
  }

  if (match.status === "unmatched") {
    return {
      ...base,
      match_method: null,
      wix_slug: null,
      action: "unmatched",
      reason: match.reason
    };
  }

  const target = buildWixPricingTarget(match.wix);
  if (!target) {
    return {
      ...base,
      match_method: match.method,
      wix_slug: match.wix.wix_slug,
      action: "manual_review",
      reason: "invalid_wix_pricing"
    };
  }

  const { patch, changes } = buildPricingPatch(row, target);
  const previousCogs = nullableNumber(row.cost_of_goods) ?? 0;
  const nextCogs = target.cost_of_goods ?? previousCogs;
  const previousSale = roundMoney(toNumber(row.price));
  const nextSale = target.price;
  const previousDerived = calculateProfitAndMargin(previousSale, previousCogs);
  const nextDerived = calculateProfitAndMargin(nextSale, nextCogs);

  if (!Object.keys(patch).length) {
    return {
      ...base,
      match_method: match.method,
      wix_slug: match.wix.wix_slug,
      action: "skip_matched",
      reason: "pricing_already_matches_wix",
      changes: [],
      margin: { previous: previousDerived.marginPercent, next: previousDerived.marginPercent },
      profit: { previous: previousDerived.profit, next: previousDerived.profit }
    };
  }

  return {
    ...base,
    match_method: match.method,
    wix_slug: match.wix.wix_slug,
    action: "update",
    reason: "wix_pricing_drift",
    changes,
    margin: { previous: previousDerived.marginPercent, next: nextDerived.marginPercent },
    profit: { previous: previousDerived.profit, next: nextDerived.profit }
  };
}

export type PricingAuditReport = {
  version: 1;
  generated_at: string;
  mode: "DRY_RUN" | "APPLIED";
  wix_source: string;
  wix_extracted_at: string;
  summary: {
    products_scanned: number;
    products_matched: number;
    products_updated: number;
    products_skipped: number;
    manual_review: number;
    unmatched: number;
    errors: number;
  };
  updates: Array<{
    slug: string;
    name: string;
    sku: string | null;
    match_method: PricingMatchMethod;
    wix_slug: string;
    changes: PricingFieldChange[];
    margin: { previous: number | null; next: number | null };
    profit: { previous: number | null; next: number | null };
  }>;
  skipped: Array<{ slug: string; name: string; wix_slug: string; match_method: PricingMatchMethod }>;
  manual_review: Array<{ slug: string; name: string; reason: string; candidates?: string[] }>;
  unmatched: Array<{ slug: string; name: string; reason: string }>;
  errors: Array<{ slug: string; message: string }>;
};

export function buildPricingAuditReport(
  rows: PricingAuditDbRow[],
  wixProducts: WixProductSnapshot[],
  options: {
    mode?: "DRY_RUN" | "APPLIED";
    wixSource?: string;
    wixExtractedAt?: string;
    updated?: number;
    errors?: Array<{ slug: string; message: string }>;
  } = {}
): PricingAuditReport {
  const indexes = buildWixPricingIndexes(wixProducts);
  const entries = rows.map((row) => auditProductPricing(row, matchDbRowToWixPricing(row, indexes)));

  const updates = entries.filter((entry) => entry.action === "update");
  const skipped = entries.filter((entry) => entry.action === "skip_matched");
  const manual = entries.filter((entry) => entry.action === "manual_review");
  const unmatched = entries.filter((entry) => entry.action === "unmatched");
  const matched = entries.filter((entry) => entry.match_method);

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    mode: options.mode ?? "DRY_RUN",
    wix_source: options.wixSource ?? "wix-stores-api",
    wix_extracted_at: options.wixExtractedAt ?? new Date().toISOString(),
    summary: {
      products_scanned: rows.length,
      products_matched: matched.length,
      products_updated: options.updated ?? updates.length,
      products_skipped: skipped.length,
      manual_review: manual.length,
      unmatched: unmatched.length,
      errors: options.errors?.length ?? 0
    },
    updates: updates.map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      sku: entry.sku,
      match_method: entry.match_method!,
      wix_slug: entry.wix_slug!,
      changes: entry.changes,
      margin: entry.margin,
      profit: entry.profit
    })),
    skipped: skipped.map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      wix_slug: entry.wix_slug!,
      match_method: entry.match_method!
    })),
    manual_review: manual.map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      reason: entry.reason
    })),
    unmatched: unmatched.map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      reason: entry.reason
    })),
    errors: options.errors ?? []
  };
}
