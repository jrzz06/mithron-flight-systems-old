import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { fetchWixCatalog, loadWixClientFromEnv, type WixCatalogSnapshot } from "../lib/wix/catalog-client.ts";
import {
  auditProductPricing,
  buildPricingAuditReport,
  buildPricingPatch,
  buildWixPricingTarget,
  matchDbRowToWixPricing,
  buildWixPricingIndexes,
  type PricingAuditDbRow,
  type PricingAuditReport
} from "../lib/product-migration/pricing-audit.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultWixPath = join(root, "data", "wix-catalog.snapshot.json");
const defaultReportPath = join(root, "data", "wix-pricing-reconciliation-report.json");

function loadProjectEnv() {
  for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
    if (!existsSync(envPath)) continue;
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eq = trimmed.indexOf("=");
      const name = trimmed.slice(0, eq);
      if (!name || process.env[name]) continue;
      process.env[name] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
    }
  }
}

function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function fetchAllProducts(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const rows: PricingAuditDbRow[] = [];
  const pageSize = 200;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("mithron_products")
      .select(
        "slug,name,price,compare_at,on_sale,discount_type,discount_value,cost_of_goods,show_price_per_unit,charge_tax,tax_group,tax_rate,tax_included,source_currency,source_catalog_id,source_url,specs,variants,bundles,is_visible,merge_status"
      )
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to read mithron_products: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as PricingAuditDbRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows.filter((row) => row.merge_status !== "archived_merged");
}

async function loadWixCatalog(refreshWix: boolean, wixPath: string): Promise<WixCatalogSnapshot> {
  if (refreshWix) {
    const client = loadWixClientFromEnv();
    console.log(`Fetching Wix catalog for site ${client.siteId}...`);
    const snapshot = await fetchWixCatalog(client);
    mkdirSync(dirname(wixPath), { recursive: true });
    writeFileSync(wixPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    console.log(`Wrote ${snapshot.product_count} Wix products to ${wixPath}`);
    return snapshot;
  }

  if (!existsSync(wixPath)) {
    const client = loadWixClientFromEnv();
    console.log("No Wix snapshot found — fetching live catalog...");
    const snapshot = await fetchWixCatalog(client);
    mkdirSync(dirname(wixPath), { recursive: true });
    writeFileSync(wixPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    return snapshot;
  }

  return JSON.parse(readFileSync(wixPath, "utf8")) as WixCatalogSnapshot;
}

function printSummary(report: PricingAuditReport) {
  const { summary } = report;
  console.log("\n=== Wix Pricing Reconciliation ===");
  console.log(`Mode: ${report.mode}`);
  console.log(`Wix source: ${report.wix_source} (${report.wix_extracted_at})`);
  console.log(`Products scanned: ${summary.products_scanned}`);
  console.log(`Products matched: ${summary.products_matched}`);
  console.log(`Products updated: ${summary.products_updated}`);
  console.log(`Products skipped (already correct): ${summary.products_skipped}`);
  console.log(`Manual review: ${summary.manual_review}`);
  console.log(`Unmatched: ${summary.unmatched}`);
  console.log(`Errors: ${summary.errors}`);

  if (report.updates.length) {
    console.log("\n--- Updates ---");
    for (const entry of report.updates.slice(0, 25)) {
      console.log(`\n${entry.name} (${entry.slug})`);
      for (const change of entry.changes) {
        console.log(`  ${change.field}: ${change.previous} -> ${change.next}`);
      }
    }
    if (report.updates.length > 25) {
      console.log(`\n... and ${report.updates.length - 25} more (see report JSON)`);
    }
  }

  if (report.manual_review.length) {
    console.log("\n--- Manual Review ---");
    for (const entry of report.manual_review.slice(0, 15)) {
      console.log(`  ${entry.slug}: ${entry.reason}`);
    }
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const refreshWix = process.argv.includes("--refresh-wix");
  const slugFilter = process.argv.find((arg) => arg.startsWith("--slug="))?.split("=")[1];
  const wixPath = process.argv.find((arg) => arg.startsWith("--wix="))?.split("=")[1] ?? defaultWixPath;
  const reportPath = process.argv.find((arg) => arg.startsWith("--report="))?.split("=")[1] ?? defaultReportPath;

  loadProjectEnv();

  const wixCatalog = await loadWixCatalog(refreshWix, wixPath);
  const supabase = createSupabaseAdminClient();
  const dbRows = await fetchAllProducts(supabase);
  const targets = slugFilter ? dbRows.filter((row) => row.slug === slugFilter) : dbRows;
  const indexes = buildWixPricingIndexes(wixCatalog.products);

  const errors: Array<{ slug: string; message: string }> = [];
  let updated = 0;

  for (const row of targets) {
    const match = matchDbRowToWixPricing(row, indexes);
    const entry = auditProductPricing(row, match);
    if (entry.action !== "update") continue;

    if (!match || match.status !== "matched") continue;
    const target = buildWixPricingTarget(match.wix);
    if (!target) continue;

    const { patch } = buildPricingPatch(row, target);
    if (!Object.keys(patch).length) continue;

    if (apply) {
      const { error } = await supabase.from("mithron_products").update(patch).eq("slug", row.slug);
      if (error) {
        errors.push({ slug: row.slug, message: error.message });
        continue;
      }
    }

    updated += 1;
  }

  const report = buildPricingAuditReport(targets, wixCatalog.products, {
    mode: apply ? "APPLIED" : "DRY_RUN",
    wixSource: refreshWix ? "wix-stores-api-live" : existsSync(wixPath) ? `snapshot:${wixPath}` : "wix-stores-api-live",
    wixExtractedAt: wixCatalog.extracted_at,
    updated: apply ? updated : undefined,
    errors
  });

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  printSummary(report);
  console.log(`\nReport written to ${reportPath}`);

  if (!apply && report.updates.length) {
    console.log("\nDry run complete. Re-run with --apply to persist pricing updates.");
  }

  if (errors.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
