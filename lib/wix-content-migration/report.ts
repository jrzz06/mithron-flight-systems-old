import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ContentMigrationReport, ProductMigrationLog } from "./types.ts";

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function buildMigrationReport(input: {
  runId: string;
  mode: "DRY_RUN" | "APPLIED";
  products: ProductMigrationLog[];
}): ContentMigrationReport {
  const products = input.products;
  const attempted = products.filter((item) => item.status === "migrated" || item.status === "failed" || item.status === "dry_run");
  const migratedOrDry = products.filter((item) => item.status === "migrated" || item.status === "dry_run");
  const imageOk = migratedOrDry.filter((item) => (item.image_count ?? 0) > 0 && !item.missing_images).length;
  const descriptionOk = migratedOrDry.filter((item) => (item.overview_chars ?? 0) > 0 && !item.missing_description).length;
  const specsOk = migratedOrDry.filter((item) => (item.spec_count ?? 0) > 0).length;
  const successCount = products.filter((item) => item.status === "migrated").length;
  const failed = products.filter((item) => item.status === "failed");

  return {
    version: 2,
    generated_at: new Date().toISOString(),
    run_id: input.runId,
    mode: input.mode,
    summary: {
      total_products: products.length,
      migrated: successCount,
      skipped: products.filter((item) => item.status === "skipped").length,
      failed: failed.length,
      missing_images: products.filter((item) => item.missing_images).length,
      missing_descriptions: products.filter((item) => item.missing_description).length,
      dry_run: products.filter((item) => item.status === "dry_run").length,
      image_success_rate_pct: pct(imageOk, attempted.length || 1),
      description_success_rate_pct: pct(descriptionOk, attempted.length || 1),
      specification_success_rate_pct: pct(specsOk, attempted.length || 1),
      overall_success_rate_pct: pct(
        input.mode === "APPLIED" ? successCount : migratedOrDry.length,
        attempted.length || 1
      )
    },
    failed_products: failed,
    products
  };
}

export function writeMigrationReport(path: string, report: ContentMigrationReport) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return path;
}

export function printReportSummary(report: ContentMigrationReport) {
  const { summary } = report;
  const parts = [
    `run_id=${report.run_id}`,
    `mode=${report.mode}`,
    `total=${summary.total_products}`,
    summary.total_wix_products != null ? `wix=${summary.total_wix_products}` : null,
    summary.total_supabase_products != null ? `supabase=${summary.total_supabase_products}` : null,
    summary.matched != null ? `matched=${summary.matched}` : null,
    summary.unmatched != null ? `unmatched=${summary.unmatched}` : null,
    summary.duplicate_matches != null ? `duplicates=${summary.duplicate_matches}` : null,
    `migrated=${summary.migrated}`,
    `skipped=${summary.skipped}`,
    `failed=${summary.failed}`,
    `missing_images=${summary.missing_images}`,
    `missing_descriptions=${summary.missing_descriptions}`,
    `dry_run=${summary.dry_run}`
  ];

  if (summary.image_success_rate_pct != null) parts.push(`image_ok%=${summary.image_success_rate_pct}`);
  if (summary.description_success_rate_pct != null) parts.push(`desc_ok%=${summary.description_success_rate_pct}`);
  if (summary.specification_success_rate_pct != null) parts.push(`specs_ok%=${summary.specification_success_rate_pct}`);
  if (summary.overall_success_rate_pct != null) parts.push(`overall_ok%=${summary.overall_success_rate_pct}`);
  if (summary.estimated_migration_success_rate_pct != null) {
    parts.push(`estimated_ok%=${summary.estimated_migration_success_rate_pct}`);
  }

  console.log(parts.filter(Boolean).join(" "));
}
