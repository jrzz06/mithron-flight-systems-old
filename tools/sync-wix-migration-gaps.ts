import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type { WixCatalogSnapshot } from "../lib/wix/catalog-client.ts";
import {
  buildSafeMigrationPatch,
  matchDbRowToWixProduct,
  type MigrationDbRow
} from "../lib/product-migration/field-audit.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultWixPath = join(root, "data", "wix-catalog.snapshot.json");
const defaultReportPath = join(root, "data", "wix-migration-sync-report.json");

function loadProjectEnv() {
  for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
    if (!existsSync(envPath)) continue;
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [name, ...parts] = trimmed.split("=");
      if (!name || process.env[name]) continue;
      process.env[name] = parts.join("=").replace(/^["']|["']$/g, "");
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
  const rows: MigrationDbRow[] = [];
  const pageSize = 200;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("mithron_products")
      .select(
        "slug,name,tagline,price,compare_at,on_sale,description,source_description,source_catalog_id,source_url,source_fingerprint,source_images,source_availability,source_currency,category,badge,seo_title,seo_description,og_title,og_description,og_image,image,hero,gallery,variants,bundles,story,specs,anchors,workflow_status,is_visible,merge_status"
      )
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to read mithron_products: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as MigrationDbRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function main() {
  const dryRun = !process.argv.includes("--apply");
  const reshapeContent = process.argv.includes("--reshape-content");
  const slugFilter = process.argv.find((arg) => arg.startsWith("--slug="))?.split("=")[1];
  const wixPath = process.argv.find((arg) => arg.startsWith("--wix="))?.split("=")[1] ?? defaultWixPath;
  const reportPath = process.argv.find((arg) => arg.startsWith("--report="))?.split("=")[1] ?? defaultReportPath;

  loadProjectEnv();

  if (!existsSync(wixPath)) {
    throw new Error(`Wix snapshot not found at ${wixPath}. Run: npm run products:audit-wix-migration -- --refresh-wix`);
  }

  const wixCatalog = JSON.parse(readFileSync(wixPath, "utf8")) as WixCatalogSnapshot;
  const supabase = createSupabaseAdminClient();
  const dbRows = await fetchAllProducts(supabase);
  const activeRows = dbRows.filter((row) => row.merge_status !== "archived_merged");
  const targets = slugFilter ? activeRows.filter((row) => row.slug === slugFilter) : activeRows;

  const patches: Array<{ slug: string; wix_slug: string; fields: string[] }> = [];
  const skipped: Array<{ slug: string; reason: string }> = [];
  const errors: Array<{ slug: string; message: string }> = [];

  for (const row of targets) {
    const wix = matchDbRowToWixProduct(row, wixCatalog.products);
    if (!wix) {
      skipped.push({ slug: row.slug, reason: "no_wix_match" });
      continue;
    }

    const patch = buildSafeMigrationPatch(row, wix, { reshapeContent });
    const fields = Object.keys(patch).filter((key) => key !== "updated_at" && key !== "source_extracted_at");
    if (!fields.length) {
      skipped.push({ slug: row.slug, reason: "already_complete" });
      continue;
    }

    patches.push({ slug: row.slug, wix_slug: wix.wix_slug, fields });
    if (!dryRun) {
      const { error } = await supabase.from("mithron_products").update(patch).eq("slug", row.slug);
      if (error) errors.push({ slug: row.slug, message: error.message });
    }
  }

  const syncReport = {
    version: 1,
    generated_at: new Date().toISOString(),
    mode: dryRun ? "DRY_RUN" : "APPLIED",
    summary: {
      candidates: targets.length,
      patched: patches.length,
      skipped: skipped.length,
      errors: errors.length
    },
    patches,
    skipped: skipped.slice(0, 50),
    errors
  };

  writeFileSync(reportPath, `${JSON.stringify(syncReport, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...syncReport.summary, report_path: reportPath, sample_patches: patches.slice(0, 10) }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
