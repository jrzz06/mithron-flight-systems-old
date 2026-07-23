import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  createSupabaseAdminClient,
  fetchMigrationProducts,
  loadProjectEnv
} from "../lib/wix-content-migration/runner.ts";
import { createRunId, reportPath } from "../lib/wix-content-migration/paths.ts";
import { MIGRATION_BACKUP_VARIANT_ID, CUTOUT_VARIANT_ID } from "../lib/wix-content-migration/types.ts";
import { printReportSummary } from "../lib/wix-content-migration/report.ts";

function parseArgs(argv: string[]) {
  const getValue = (prefix: string) => {
    const hit = argv.find((arg) => arg.startsWith(prefix));
    return hit ? hit.slice(prefix.length).trim() : null;
  };
  return {
    runId: getValue("--run-id=") || createRunId("wix-content-review"),
    slug: getValue("--slug="),
    help: argv.includes("--help") || argv.includes("-h")
  };
}

function printHelp() {
  console.log(`Manual review report for Wix content migration

Lists products in pending_review with archived cutout/backup media still retained.

Usage:
  npm run products:migrate-wix-content:review -- [--run-id=<id>] [--slug=<slug>]
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  loadProjectEnv();
  const supabase = createSupabaseAdminClient();
  let rows = await fetchMigrationProducts(supabase);
  if (options.slug) rows = rows.filter((row) => row.slug === options.slug);

  const pending = rows.filter((row) => row.workflow_status === "pending_review");
  const products = [];

  for (const row of pending) {
    const { data: links } = await supabase
      .from("product_media_assets")
      .select("usage,variant_id,media_asset_id,metadata")
      .eq("product_slug", row.slug);

    const archivedCutouts = (links ?? []).filter(
      (link) =>
        link.variant_id === CUTOUT_VARIANT_ID
        || link.variant_id === MIGRATION_BACKUP_VARIANT_ID
        || (link.usage === "cms" && Boolean((link.metadata as { retained_until_manual_approval?: boolean } | null)?.retained_until_manual_approval))
    );

    products.push({
      slug: row.slug,
      name: row.name,
      workflow_status: row.workflow_status,
      has_description: Boolean(String(row.description ?? "").trim()),
      gallery_count: Array.isArray(row.gallery) ? row.gallery.length : 0,
      archived_media_links: archivedCutouts.length,
      review_checklist: {
        image: false,
        gallery: false,
        description: false,
        specifications: false
      }
    });
  }

  const report = {
    version: 2,
    generated_at: new Date().toISOString(),
    run_id: options.runId,
    mode: "MANUAL_REVIEW" as const,
    summary: {
      total_products: products.length,
      migrated: products.length,
      skipped: 0,
      failed: 0,
      missing_images: 0,
      missing_descriptions: products.filter((item) => !item.has_description).length,
      dry_run: 0,
      pending_review: products.length
    },
    products,
    note: "Do not delete cutouts until every product is manually verified. Then run approve-delete-cutouts with --confirm=DELETE_CUTOUTS."
  };

  const outPath = reportPath(options.runId, "manual-review");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  printReportSummary(report);
  console.log(`report=${outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
