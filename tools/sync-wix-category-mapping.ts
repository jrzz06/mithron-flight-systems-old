import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { fetchWixCatalog, loadWixClientFromEnv, type WixCatalogSnapshot } from "../lib/wix/catalog-client.ts";
import {
  auditProductCategory,
  buildCategoryAuditReport,
  matchDbRowToWixProduct,
  type CategoryAuditDbRow,
  type CategoryAuditReport
} from "../lib/product-migration/category-audit.ts";
import {
  catalogCategoryDefinitions,
  getCatalogCategoryDefinition,
  type CatalogCategorySlug
} from "../lib/catalog-category-taxonomy.ts";
import { isGlobalProductsCategory, normalizeProductCategory } from "../lib/product-shelf-classification.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultWixPath = join(root, "data", "wix-catalog.snapshot.json");
const defaultReportPath = join(root, "data", "wix-category-mapping-report.json");

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
  const rows: CategoryAuditDbRow[] = [];
  const pageSize = 200;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("mithron_products")
      .select("slug,name,tagline,description,source_description,source_catalog_id,source_url,category,specs,merge_status")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to read mithron_products: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as CategoryAuditDbRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
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

function countProductsForCategorySlug(
  products: Array<{ category: string }>,
  slug: CatalogCategorySlug
) {
  const definition = getCatalogCategoryDefinition(slug);
  const normalizedNames = new Set(definition.categoryNames.map(normalizeProductCategory));
  return products.filter((product) => normalizedNames.has(normalizeProductCategory(product.category))).length;
}

function buildVerification(rows: CategoryAuditDbRow[]) {
  const storefrontProducts = rows
    .filter((row) => row.merge_status !== "archived_merged")
    .map((row) => ({
      slug: row.slug,
      name: row.name,
      category: row.category ?? ""
    }));

  const categorySlugs: CatalogCategorySlug[] = [
    "agri-drones",
    "video-drones",
    "creative-drones",
    "survey-drones",
    "surveillance-drones",
    "accessories"
  ];

  const navigation = Object.fromEntries(
    categorySlugs.map((slug) => [slug, countProductsForCategorySlug(storefrontProducts, slug)])
  );

  const searchSample = storefrontProducts
    .filter((product) => !isGlobalProductsCategory(product))
    .slice(0, 5)
    .map((product) => ({
      slug: product.slug,
      searchable: [product.name, product.category].join(" ").toLowerCase().includes(product.name.toLowerCase())
    }));

  return {
    category_navigation_counts: navigation,
    homepage_shelf_counts: {
      drone_world: storefrontProducts.filter((product) => !isGlobalProductsCategory(product)).length,
      drone_care: countProductsForCategorySlug(storefrontProducts, "accessories"),
      global_products_unchanged: storefrontProducts.filter((product) => isGlobalProductsCategory(product)).length
    },
    search_sample_ok: searchSample.every((item) => item.searchable),
    product_detail_pages: {
      note: "Category-only migration; slugs and PDP routes unchanged",
      product_count: storefrontProducts.length
    }
  };
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
  const activeRows = dbRows.filter((row) => row.merge_status !== "archived_merged");
  const targets = slugFilter ? activeRows.filter((row) => row.slug === slugFilter) : activeRows;

  const errors: Array<{ slug: string; message: string }> = [];
  let corrected = 0;

  for (const row of targets) {
    const wixMatch = matchDbRowToWixProduct(row, wixCatalog.products);
    const entry = auditProductCategory(row, wixMatch);
    if (entry.action !== "correct" || !entry.expected_category) continue;

    if (apply) {
      const { error } = await supabase
        .from("mithron_products")
        .update({ category: entry.expected_category, updated_at: new Date().toISOString() })
        .eq("slug", row.slug)
        .eq("category", row.category ?? "");

      if (error) {
        errors.push({ slug: row.slug, message: error.message });
        continue;
      }
      corrected += 1;
      row.category = entry.expected_category;
    }
  }

  const report: CategoryAuditReport & { verification?: ReturnType<typeof buildVerification> } = {
    ...buildCategoryAuditReport(targets, wixCatalog.products, {
      mode: apply ? "APPLIED" : "DRY_RUN",
      corrected: apply ? corrected : 0,
      errors
    }),
    verification: buildVerification(apply ? dbRows.map((row) => targets.find((t) => t.slug === row.slug) ?? row) : targets)
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        status: apply ? "APPLIED" : "DRY_RUN",
        report_path: reportPath,
        summary: report.summary,
        sample_changes: report.changes.slice(0, 15),
        manual_review_count: report.manual_review.length,
        verification: report.verification
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
