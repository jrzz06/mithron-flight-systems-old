import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { fetchWixCatalog, loadWixClientFromEnv, type WixCatalogSnapshot } from "../lib/wix/catalog-client.ts";
import {
  auditProductDescription,
  buildDescriptionAuditReport,
  type DescriptionAuditDbRow,
  type DescriptionAuditReport
} from "../lib/product-migration/description-audit.ts";
import { matchDbRowToWixProduct } from "../lib/product-migration/category-audit.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultWixPath = join(root, "data", "wix-catalog.snapshot.json");
const defaultReportPath = join(root, "data", "wix-description-cleanup-report.json");

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
  const rows: DescriptionAuditDbRow[] = [];
  const pageSize = 200;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("mithron_products")
      .select(
        "slug,name,tagline,description,source_description,source_catalog_id,source_url,category,specs,merge_status"
      )
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to read mithron_products: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as DescriptionAuditDbRow[]));
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

  const errors: Array<{ slug: string; message: string }> = [];
  let updated = 0;

  for (const row of targets) {
    const wixMatch = matchDbRowToWixProduct(row, wixCatalog.products);
    const entry = auditProductDescription(row, wixMatch);
    if (entry.action !== "update" || !entry.next_description) continue;

    if (apply) {
      const patch: Record<string, string> = {
        description: entry.next_description,
        updated_at: new Date().toISOString()
      };
      if (entry.next_source_description) {
        patch.source_description = entry.next_source_description;
      }

      const { error } = await supabase.from("mithron_products").update(patch).eq("slug", row.slug);

      if (error) {
        errors.push({ slug: row.slug, message: error.message });
        continue;
      }

      updated += 1;
      row.description = entry.next_description;
      if (entry.next_source_description) row.source_description = entry.next_source_description;
    }
  }

  const report: DescriptionAuditReport = buildDescriptionAuditReport(targets, wixCatalog.products, {
    mode: apply ? "APPLIED" : "DRY_RUN",
    updated: apply ? updated : undefined,
    errors
  });

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        status: apply ? "APPLIED" : "DRY_RUN",
        report_path: reportPath,
        summary: report.summary,
        sample_updates: report.updates.slice(0, 12),
        manual_review_count: report.manual_review.length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
