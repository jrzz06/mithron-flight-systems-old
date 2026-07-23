import type { WixCatalogSnapshot } from "../wix/catalog-client.ts";
import { findDuplicateWixMatches, matchProductForContentMigration } from "./match.ts";
import { assertNonEmptyContent, parseWixProductContent } from "./parse-content.ts";
import type { ContentMigrationDbRow, ContentMigrationReport, ProductMigrationLog } from "./types.ts";

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function dbDescriptionIncomplete(row: ContentMigrationDbRow) {
  const text = String(row.description ?? row.source_description ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length < 80;
}

/**
 * Phase 1 analysis — matching + gap estimate only. No downloads, no writes.
 */
export function buildPhase1AnalysisReport(input: {
  runId: string;
  wixCatalog: WixCatalogSnapshot;
  dbRows: ContentMigrationDbRow[];
}): ContentMigrationReport {
  const products: ProductMigrationLog[] = [];
  const matchedWixIds = new Set<string>();
  const matchedDbSlugs = new Set<string>();
  let missingImages = 0;
  let missingDescriptions = 0;
  let estimableSuccess = 0;

  for (const row of input.dbRows) {
    const match = matchProductForContentMigration(row, input.wixCatalog.products);
    if ("error" in match) {
      products.push({
        slug: row.slug,
        wix_slug: null,
        wix_product_id: null,
        status: "skipped",
        reason: match.error,
        missing_images: true,
        missing_description: true,
        error: match.candidates?.join(",")
      });
      continue;
    }

    matchedWixIds.add(match.wix.wix_product_id);
    matchedDbSlugs.add(row.slug);
    const payload = parseWixProductContent(match.wix);
    const flags = assertNonEmptyContent(payload);
    const dbMissingDescription = dbDescriptionIncomplete(row);
    const wixMissingImages = !flags.hasImages;
    const wixMissingDescription = !flags.hasOverview;

    if (wixMissingImages || dbMissingDescription) missingImages += wixMissingImages ? 1 : 0;
    if (wixMissingDescription || dbMissingDescription) missingDescriptions += 1;

    const canMigrate = flags.hasOverview || flags.hasImages;
    if (canMigrate) estimableSuccess += 1;

    products.push({
      slug: row.slug,
      wix_slug: match.wix.wix_slug,
      wix_product_id: match.wix.wix_product_id,
      status: "dry_run",
      reason: canMigrate ? "matched_ready" : "matched_empty_wix",
      confidence: match.confidence,
      image_count: payload.images.length,
      spec_count: payload.specifications.length,
      overview_chars: payload.overview.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length,
      missing_images: wixMissingImages,
      missing_description: wixMissingDescription || dbMissingDescription
    });
  }

  const duplicates = findDuplicateWixMatches(input.dbRows, input.wixCatalog.products);
  const unmatchedWix = input.wixCatalog.products
    .filter((product) => product.visible !== false && !matchedWixIds.has(product.wix_product_id))
    .map((product) => ({ wix_slug: product.wix_slug, name: product.name }));
  const unmatchedDb = input.dbRows
    .filter((row) => !matchedDbSlugs.has(row.slug))
    .map((row) => ({ slug: row.slug, name: row.name }));

  const matched = products.filter((item) => item.status === "dry_run").length;

  return {
    version: 2,
    generated_at: new Date().toISOString(),
    run_id: input.runId,
    mode: "ANALYSIS",
    summary: {
      total_products: products.length,
      total_wix_products: input.wixCatalog.products.length,
      total_supabase_products: input.dbRows.length,
      matched,
      unmatched: unmatchedWix.length + unmatchedDb.length,
      duplicate_matches: duplicates.length,
      migrated: 0,
      skipped: products.filter((item) => item.status === "skipped").length,
      failed: 0,
      missing_images: missingImages,
      missing_descriptions: missingDescriptions,
      dry_run: matched,
      estimated_migration_success_rate_pct: pct(estimableSuccess, matched || 1)
    },
    duplicates,
    unmatched_wix: unmatchedWix,
    unmatched_db: unmatchedDb,
    products
  };
}
