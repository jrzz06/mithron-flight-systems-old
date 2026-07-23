import { normalizeCatalogName } from "../wix/catalog-normalize.ts";
import type { WixProductSnapshot } from "../wix/catalog-client.ts";
import type { ContentMatchResult, ContentMigrationDbRow, MatchConfidence } from "./types.ts";

function stripSourcePrefix(slug: string) {
  return slug.replace(/^source-/, "");
}

function normalizeSku(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function readDbSku(row: ContentMigrationDbRow) {
  const fromSpecs = row.specs?.["Product ID"] || row.specs?.SKU || row.specs?.Sku || row.specs?.sku;
  return normalizeSku(fromSpecs);
}

function findByNameUniquely(row: ContentMigrationDbRow, wixProducts: WixProductSnapshot[]) {
  const normalizedName = normalizeCatalogName(row.name);
  const matches = wixProducts.filter((product) => normalizeCatalogName(product.name) === normalizedName);
  if (matches.length === 1) return matches[0];
  return null;
}

/**
 * Match priority (exact only — never fuzzy similarity):
 * 1. External ID (source_catalog_id / mithron-{wix_slug})
 * 2. SKU
 * 3. Slug (including source-{wix_slug})
 * 4. Normalized product name when unique
 */
export function matchProductForContentMigration(
  row: ContentMigrationDbRow,
  wixProducts: WixProductSnapshot[]
): ContentMatchResult | { error: "no_match" | "ambiguous_match"; candidates?: string[] } {
  const byCatalogId = new Map(wixProducts.map((product) => [product.source_catalog_id, product]));
  const byWixProductId = new Map(wixProducts.map((product) => [product.wix_product_id, product]));
  const byWixSlug = new Map(wixProducts.map((product) => [product.wix_slug, product]));
  const byUrl = new Map(wixProducts.map((product) => [product.source_url.toLowerCase(), product]));

  // 1. External ID
  if (row.source_catalog_id && byCatalogId.has(row.source_catalog_id)) {
    return { wix: byCatalogId.get(row.source_catalog_id)!, confidence: "external_id" };
  }
  if (row.source_catalog_id && byWixProductId.has(row.source_catalog_id)) {
    return { wix: byWixProductId.get(row.source_catalog_id)!, confidence: "external_id" };
  }

  // source_url is a stable external pointer (kept as high-confidence external match)
  if (row.source_url && byUrl.has(row.source_url.toLowerCase())) {
    return { wix: byUrl.get(row.source_url.toLowerCase())!, confidence: "external_id" };
  }

  // 2. SKU (exact)
  const dbSku = readDbSku(row);
  if (dbSku) {
    const skuMatches = wixProducts.filter((product) => normalizeSku(product.sku) === dbSku);
    if (skuMatches.length === 1) {
      return { wix: skuMatches[0], confidence: "sku" };
    }
    if (skuMatches.length > 1) {
      return { error: "ambiguous_match", candidates: skuMatches.map((product) => product.wix_slug) };
    }
  }

  // 3. Slug
  const slugCandidates = [row.slug, stripSourcePrefix(row.slug)].filter(Boolean);
  for (const candidate of slugCandidates) {
    if (byWixSlug.has(candidate)) {
      return { wix: byWixSlug.get(candidate)!, confidence: "slug" };
    }
  }

  // 4. Normalized name — unique only
  const uniqueName = findByNameUniquely(row, wixProducts);
  if (uniqueName) {
    return { wix: uniqueName, confidence: "unique_name" };
  }

  const normalizedName = normalizeCatalogName(row.name);
  const ambiguous = wixProducts
    .filter((product) => normalizeCatalogName(product.name) === normalizedName)
    .map((product) => product.wix_slug);

  if (ambiguous.length > 1) {
    return { error: "ambiguous_match", candidates: ambiguous };
  }

  return { error: "no_match" };
}

export function isConfidentMatch(confidence: MatchConfidence) {
  return confidence === "external_id"
    || confidence === "sku"
    || confidence === "slug"
    || confidence === "unique_name"
    || confidence === "source_catalog_id"
    || confidence === "source_url";
}

export function findDuplicateWixMatches(
  rows: ContentMigrationDbRow[],
  wixProducts: WixProductSnapshot[]
) {
  const matched = new Map<string, string[]>();
  for (const row of rows) {
    const result = matchProductForContentMigration(row, wixProducts);
    if (!("wix" in result)) continue;
    const key = result.wix.wix_product_id;
    const list = matched.get(key) ?? [];
    list.push(row.slug);
    matched.set(key, list);
  }
  return [...matched.entries()]
    .filter(([, slugs]) => slugs.length > 1)
    .map(([wixProductId, slugs]) => ({ wix_product_id: wixProductId, db_slugs: slugs }));
}
