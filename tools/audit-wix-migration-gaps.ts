import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { fetchWixCatalog, loadWixClientFromEnv } from "../lib/wix/catalog-client.ts";
import {
  buildMigrationAuditReport,
  type MigrationDbRow
} from "../lib/product-migration/field-audit.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultReportPath = join(root, "data", "wix-migration-audit.json");

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
  const refreshWix = process.argv.includes("--refresh-wix");
  const outputPath = process.argv.find((arg) => arg.startsWith("--out="))?.split("=")[1] ?? defaultReportPath;
  loadProjectEnv();

  const wixCatalogPath = join(root, "data", "wix-catalog.snapshot.json");
  if (refreshWix) {
    const client = loadWixClientFromEnv();
    console.log(`Fetching Wix catalog for site ${client.siteId}...`);
    const snapshot = await fetchWixCatalog(client);
    mkdirSync(dirname(wixCatalogPath), { recursive: true });
    writeFileSync(wixCatalogPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    console.log(`Wrote ${snapshot.product_count} Wix products to ${wixCatalogPath}`);
  } else if (!existsSync(wixCatalogPath)) {
    const client = loadWixClientFromEnv();
    console.log("No Wix snapshot found — fetching live catalog...");
    const snapshot = await fetchWixCatalog(client);
    mkdirSync(dirname(wixCatalogPath), { recursive: true });
    writeFileSync(wixCatalogPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }

  const wixCatalog = JSON.parse(readFileSync(wixCatalogPath, "utf8"));
  const supabase = createSupabaseAdminClient();
  const dbRows = await fetchAllProducts(supabase);
  const report = buildMigrationAuditReport(wixCatalog.products, dbRows);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const worst = report.products.filter((product) => product.matched).slice(0, 10);
  console.log(
    JSON.stringify(
      {
        status: "AUDITED",
        report_path: outputPath,
        summary: report.summary,
        sample_low_completeness: worst.map((product) => ({
          slug: product.slug,
          wix_slug: product.wix_slug,
          score: product.completeness_score,
          missing: product.missing_fields,
          partial: product.partial_fields
        }))
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
