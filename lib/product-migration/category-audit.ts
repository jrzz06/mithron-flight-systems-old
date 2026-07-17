import {
  catalogCategoryDefinitions,
  getCatalogCategoryByLabel
} from "../catalog-category-taxonomy.ts";
import type { WixProductSnapshot } from "../wix/catalog-client.ts";
import { normalizeCatalogName, normalizeIdentity, slugify } from "../wix/catalog-normalize.ts";
import {
  accessorySlugOverrides,
  inferMissionCategory,
  isDroneAircraft,
  isGlobalProductsCategory,
  normalizeProductCategory
} from "../product-shelf-classification.ts";

export type CategoryAuditDbRow = {
  slug: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  source_description?: string | null;
  source_catalog_id?: string | null;
  source_url?: string | null;
  category?: string | null;
  specs?: Record<string, string> | null;
  merge_status?: string | null;
};

export type WixMatchKind = "source_catalog_id" | "source_url" | "slug" | "derived_slug" | "name";

export type WixMatchResult = {
  product: WixProductSnapshot;
  kind: WixMatchKind;
  trusted_for_category: boolean;
};

function deriveWixSlugFromDbRow(row: CategoryAuditDbRow) {
  if (row.slug.startsWith("source-")) return row.slug.slice("source-".length);
  if (row.source_catalog_id?.startsWith("mithron-")) {
    return row.source_catalog_id.slice("mithron-".length);
  }
  return row.slug;
}

function slugsAlignForSameProduct(rowSlug: string, wixSlug: string) {
  if (rowSlug === wixSlug) return true;
  if (slugify(rowSlug) === slugify(wixSlug)) return true;
  return normalizeIdentity(rowSlug) === normalizeIdentity(wixSlug);
}

function hasWixIdentityMismatch(row: CategoryAuditDbRow, wix: WixProductSnapshot, wixProducts: WixProductSnapshot[]) {
  const slugDerived = row.slug.startsWith("source-") ? row.slug.slice("source-".length) : row.slug;
  if (slugsAlignForSameProduct(slugDerived, wix.wix_slug)) return false;

  const byWixSlug = new Map(wixProducts.map((product) => [product.wix_slug, product]));
  const competing = byWixSlug.get(slugDerived);
  if (competing && competing.wix_product_id !== wix.wix_product_id) {
    return normalizeCatalogName(competing.name) === normalizeCatalogName(row.name);
  }

  if (normalizeCatalogName(row.name) !== normalizeCatalogName(wix.name)) return false;
  return !slugsAlignForSameProduct(slugDerived, wix.wix_slug);
}

export function matchDbRowToWixProduct(
  row: CategoryAuditDbRow,
  wixProducts: WixProductSnapshot[]
): WixMatchResult | null {
  const byCatalogId = new Map(wixProducts.map((product) => [product.source_catalog_id, product]));
  const byWixSlug = new Map(wixProducts.map((product) => [product.wix_slug, product]));
  const byUrl = new Map(wixProducts.map((product) => [product.source_url.toLowerCase(), product]));

  const derivedSlug = row.slug.startsWith("source-") ? row.slug.slice("source-".length) : row.slug;
  if (derivedSlug && byWixSlug.has(derivedSlug)) {
    return {
      product: byWixSlug.get(derivedSlug)!,
      kind: "derived_slug",
      trusted_for_category: true
    };
  }

  if (row.source_catalog_id && byCatalogId.has(row.source_catalog_id)) {
    const product = byCatalogId.get(row.source_catalog_id)!;
    return {
      product,
      kind: "source_catalog_id",
      trusted_for_category: !hasWixIdentityMismatch(row, product, wixProducts)
    };
  }

  if (row.source_url && byUrl.has(row.source_url.toLowerCase())) {
    const product = byUrl.get(row.source_url.toLowerCase())!;
    return {
      product,
      kind: "source_url",
      trusted_for_category: !hasWixIdentityMismatch(row, product, wixProducts)
    };
  }

  if (byWixSlug.has(row.slug)) {
    return {
      product: byWixSlug.get(row.slug)!,
      kind: "slug",
      trusted_for_category: true
    };
  }

  const normalizedName = normalizeCatalogName(row.name);
  const byName = wixProducts.find((product) => normalizeCatalogName(product.name) === normalizedName);
  if (byName) {
    return {
      product: byName,
      kind: "name",
      trusted_for_category: false
    };
  }

  return null;
}

export const LEGACY_INVALID_CATEGORIES = new Set([
  "Imported Wix Inventory",
  "Imported Wix",
  "Uncategorized",
  "General"
]);

export type CategoryResolutionSource = "wix" | "metadata" | "none";

export type CategoryAuditEntry = {
  slug: string;
  name: string;
  current_category: string;
  expected_category: string | null;
  resolution_source: CategoryResolutionSource;
  wix_slug: string | null;
  wix_categories: string[];
  reason: string;
  action: "correct" | "skip_correct" | "skip_global" | "manual_review";
};

export type CategoryAuditReport = {
  version: 1;
  generated_at: string;
  mode: "DRY_RUN" | "APPLIED";
  summary: {
    total_audited: number;
    excluded_global_products: number;
    already_correct: number;
    to_correct: number;
    corrected: number;
    manual_review: number;
    errors: number;
  };
  changes: Array<{
    slug: string;
    name: string;
    previous_category: string;
    new_category: string;
    wix_slug: string | null;
    resolution_source: CategoryResolutionSource;
    reason: string;
  }>;
  skipped_correct: Array<{ slug: string; name: string; category: string }>;
  manual_review: Array<{
    slug: string;
    name: string;
    current_category: string;
    wix_slug: string | null;
    wix_categories: string[];
    reason: string;
  }>;
  errors: Array<{ slug: string; message: string }>;
};

function isResolvableCatalogLabel(label: string) {
  const definition = getCatalogCategoryByLabel(label);
  return Boolean(definition && definition.slug !== "global-products");
}

export function resolveCanonicalCategoryLabel(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;

  const trimmed = raw.trim();
  const byLabel = getCatalogCategoryByLabel(trimmed);
  if (byLabel && byLabel.slug !== "global-products") {
    return byLabel.categoryNames[0] ?? trimmed;
  }

  const normalized = normalizeProductCategory(trimmed);
  for (const definition of catalogCategoryDefinitions) {
    if (definition.slug === "global-products") continue;
    if (definition.categoryNames.some((name) => normalizeProductCategory(name) === normalized)) {
      return definition.categoryNames[0];
    }
  }

  const slugified = slugify(trimmed);
  for (const definition of catalogCategoryDefinitions) {
    if (definition.slug === "global-products") continue;
    const aliases = [
      definition.slug,
      definition.cmsRouteKey,
      definition.menuKey,
      definition.legacyHref.replace(/^\//, ""),
      ...definition.categoryNames.map((name) => slugify(name))
    ];
    if (
      aliases.some(
        (alias) =>
          slugify(alias) === slugified || normalizeCatalogName(alias) === normalizeCatalogName(trimmed)
      )
    ) {
      return definition.categoryNames[0];
    }
  }

  return null;
}

function collectWixCategoryCandidates(wix: WixProductSnapshot) {
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const value of [wix.category, ...wix.rich.categories]) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    candidates.push(trimmed);
  }
  return candidates;
}

export function resolveExpectedCategoryFromWix(
  wix: WixProductSnapshot
): { label: string; source: string; wix_categories: string[] } | null {
  const candidates = collectWixCategoryCandidates(wix);
  for (const candidate of candidates) {
    const label = resolveCanonicalCategoryLabel(candidate);
    if (label) {
      return { label, source: candidate, wix_categories: candidates };
    }
  }
  return null;
}

function productMetadataText(row: CategoryAuditDbRow) {
  const specText = Object.entries(row.specs ?? {})
    .map(([key, value]) => `${key} ${value}`)
    .join(" ");
  return [
    row.slug,
    row.name,
    row.tagline,
    row.description,
    row.source_description,
    row.category,
    specText
  ]
    .filter(Boolean)
    .join(" ");
}

function resolveShelfOverrideCategory(row: CategoryAuditDbRow): { label: string; reason: string } | null {
  if (accessorySlugOverrides.has(row.slug)) {
    const label = resolveCanonicalCategoryLabel("Accessories");
    if (label) return { label, reason: "shelf_accessory_slug_override" };
  }
  return null;
}

function toShelfInput(row: CategoryAuditDbRow) {
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? "",
    category: row.category ?? "",
    interests: [] as string[],
    specs: row.specs ?? {}
  };
}

export function resolveExpectedCategoryFromMetadata(
  row: CategoryAuditDbRow,
  options: { wixMatch?: WixMatchResult | null } = {}
): { label: string; reason: string } | null {
  const shelfOverride = resolveShelfOverrideCategory(row);
  if (shelfOverride) return shelfOverride;

  const input = toShelfInput(row);

  if (options.wixMatch && !options.wixMatch.trusted_for_category) {
    if (!isDroneAircraft(input)) {
      const label = resolveCanonicalCategoryLabel("Accessories");
      if (label) return { label, reason: "metadata_non_aircraft_product" };
    }
    return null;
  }

  if (isDroneAircraft(input)) {
    const mission = inferMissionCategory(input);
    if (isResolvableCatalogLabel(mission)) {
      return { label: mission, reason: "metadata_drone_aircraft_mission" };
    }
  }

  if (!isDroneAircraft(input)) {
    const label = resolveCanonicalCategoryLabel("Accessories");
    if (label) return { label, reason: "metadata_non_aircraft_product" };
  }

  const text = productMetadataText(row).toLowerCase();
  const accessorySignals =
    /\b(?:battery|charger|propeller|frame|arm|landing[\s-]?gear|gimbal[\s-]?camera|remote[\s-]?control|flight[\s-]?controller|motor|kv\b|adapter|cable|connector|pump|tank|software|pix4d|gnss)\b/i.test(
      text
    );
  const droneSignals = /\b(?:drone|sprayer|spreader|survey|surveillance|cinema|agri|kisan)\b/i.test(text);

  if (accessorySignals && !droneSignals) {
    const label = resolveCanonicalCategoryLabel("Accessories");
    if (label) return { label, reason: "metadata_accessory_signals" };
  }

  return null;
}

export function auditProductCategory(
  row: CategoryAuditDbRow,
  wixMatch: WixMatchResult | null
): CategoryAuditEntry {
  const currentCategory = row.category?.trim() || "";
  const wix = wixMatch?.product ?? null;

  if (isGlobalProductsCategory(toShelfInput(row))) {
    return {
      slug: row.slug,
      name: row.name,
      current_category: currentCategory,
      expected_category: currentCategory,
      resolution_source: "none",
      wix_slug: wix?.wix_slug ?? null,
      wix_categories: wix ? collectWixCategoryCandidates(wix) : [],
      reason: "global_products_excluded",
      action: "skip_global"
    };
  }

  const shelfOverride = resolveShelfOverrideCategory(row);
  const wixResolution =
    shelfOverride ? null : wix && wixMatch?.trusted_for_category ? resolveExpectedCategoryFromWix(wix) : null;
  const metadataResolution =
    shelfOverride ??
    (wixResolution ? null : resolveExpectedCategoryFromMetadata(row, { wixMatch }));
  const expected = shelfOverride?.label ?? wixResolution?.label ?? metadataResolution?.label ?? null;
  const resolutionSource: CategoryResolutionSource = shelfOverride
    ? "metadata"
    : wixResolution
      ? "wix"
      : metadataResolution
        ? "metadata"
        : "none";

  if (!expected) {
    const conflictReason = wix && wixMatch && !wixMatch.trusted_for_category;
    return {
      slug: row.slug,
      name: row.name,
      current_category: currentCategory,
      expected_category: null,
      resolution_source: "none",
      wix_slug: wix?.wix_slug ?? null,
      wix_categories: wix ? collectWixCategoryCandidates(wix) : [],
      reason: conflictReason
        ? `wix_identity_mismatch:${wixMatch.kind}`
        : wix
          ? "wix_category_unmapped"
          : "no_wix_match_and_insufficient_metadata",
      action: "manual_review"
    };
  }

  const currentCanonical = resolveCanonicalCategoryLabel(currentCategory) ?? currentCategory;
  if (
    normalizeProductCategory(currentCanonical) === normalizeProductCategory(expected)
    && !LEGACY_INVALID_CATEGORIES.has(currentCategory)
  ) {
    return {
      slug: row.slug,
      name: row.name,
      current_category: currentCategory,
      expected_category: expected,
      resolution_source: resolutionSource,
      wix_slug: wix?.wix_slug ?? null,
      wix_categories: wix ? collectWixCategoryCandidates(wix) : [],
      reason: "already_correct",
      action: "skip_correct"
    };
  }

  return {
    slug: row.slug,
    name: row.name,
    current_category: currentCategory,
    expected_category: expected,
    resolution_source: resolutionSource,
    wix_slug: wix?.wix_slug ?? null,
    wix_categories: wix ? collectWixCategoryCandidates(wix) : [],
    reason: shelfOverride
      ? shelfOverride.reason
      : wixResolution
        ? `wix_reference:${wixResolution.source}`
        : metadataResolution!.reason,
    action: "correct"
  };
}

export function buildCategoryAuditReport(
  rows: CategoryAuditDbRow[],
  wixProducts: WixProductSnapshot[],
  options: { mode?: "DRY_RUN" | "APPLIED"; corrected?: number; errors?: Array<{ slug: string; message: string }> } = {}
): CategoryAuditReport {
  const entries = rows.map((row) =>
    auditProductCategory(row, matchDbRowToWixProduct(row, wixProducts))
  );

  const excludedGlobal = entries.filter((entry) => entry.action === "skip_global");
  const audited = entries.filter((entry) => entry.action !== "skip_global");
  const skippedCorrect = audited.filter((entry) => entry.action === "skip_correct");
  const toCorrect = audited.filter((entry) => entry.action === "correct");
  const manualReview = audited.filter((entry) => entry.action === "manual_review");

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    mode: options.mode ?? "DRY_RUN",
    summary: {
      total_audited: audited.length,
      excluded_global_products: excludedGlobal.length,
      already_correct: skippedCorrect.length,
      to_correct: toCorrect.length,
      corrected: options.corrected ?? 0,
      manual_review: manualReview.length,
      errors: options.errors?.length ?? 0
    },
    changes: toCorrect.map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      previous_category: entry.current_category,
      new_category: entry.expected_category!,
      wix_slug: entry.wix_slug,
      resolution_source: entry.resolution_source,
      reason: entry.reason
    })),
    skipped_correct: skippedCorrect.map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      category: entry.current_category
    })),
    manual_review: manualReview.map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      current_category: entry.current_category,
      wix_slug: entry.wix_slug,
      wix_categories: entry.wix_categories,
      reason: entry.reason
    })),
    errors: options.errors ?? []
  };
}
