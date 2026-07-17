import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type { WixCatalogSnapshot } from "../lib/wix/catalog-client.ts";
import { buildProductReconcileReport } from "../lib/product-reconcile/audit-catalog.ts";
import type { DbProductRow } from "../lib/product-reconcile/score-canonical.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultWixPath = join(root, "data", "wix-catalog.snapshot.json");
const defaultReportPath = join(root, "data", "product-reconcile-report.json");

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
  const rows: DbProductRow[] = [];
  const pageSize = 200;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("mithron_products")
      .select(
        "slug,name,tagline,price,compare_at,on_sale,description,source_description,source_catalog_id,source_url,source_fingerprint,category,workflow_status,is_visible,image,seo_title,seo_description,tax_group,merge_status,merged_into_slug"
      )
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to read mithron_products: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as DbProductRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function main() {
  const wixPath = process.argv.find((arg) => arg.startsWith("--wix="))?.split("=")[1] ?? defaultWixPath;
  const reportPath =
    process.argv.find((arg) => arg.startsWith("--out="))?.split("=")[1] ?? defaultReportPath;

  loadProjectEnv();

  if (!existsSync(wixPath)) {
    throw new Error(`Wix snapshot not found at ${wixPath}. Run: npm run products:fetch-wix`);
  }

  const wixCatalog = JSON.parse(readFileSync(wixPath, "utf8")) as WixCatalogSnapshot;
  const supabase = createSupabaseAdminClient();
  const dbRows = await fetchAllProducts(supabase);
  const report = buildProductReconcileReport(wixCatalog.products, dbRows);

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ status: "AUDITED", reportPath, summary: report.summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
