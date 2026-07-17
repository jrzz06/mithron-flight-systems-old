/* eslint-disable @typescript-eslint/no-require-imports */
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");

const root = join(__dirname, "..");
const defaultCsvPath = join(root, "..", "product-inventory-v1_2026-05-25-2026-05-26.csv");
const warehouseCode = "IN-WEST-01";

function loadProjectEnv() {
  for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
    if (!existsSync(envPath)) continue;
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const separator = trimmed.indexOf("=");
      const name = trimmed.slice(0, separator);
      const value = trimmed.slice(separator + 1).replace(/^["']|["']$/g, "");
      if (!name || process.env[name]) continue;
      process.env[name] = value;
    }
  }
}

function installTypeScriptRuntime() {
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    if (request.startsWith("@/")) {
      return originalResolveFilename.call(this, join(root, request.slice(2)), parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  require.extensions[".ts"] = function compileTypeScript(module, filename) {
    const source = readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        resolveJsonModule: true,
        target: ts.ScriptTarget.ES2022
      },
      fileName: filename
    }).outputText;
    module._compile(output, filename);
  };
}

function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function mediaFor(record, sourceTag) {
  if (!record.imageUrl) {
    return {
      src: "",
      alt: record.productName,
      kind: "image",
      source: sourceTag
    };
  }
  return {
    src: record.imageUrl.trim(),
    alt: record.productName,
    kind: "image",
    source: sourceTag
  };
}

function serializeProduct(record, index, now, sourceTag, csvPath) {
  const media = mediaFor(record, sourceTag);
  return {
    slug: record.productSlug,
    name: record.productName,
    tagline: `${record.productName} inventory record`,
    price: record.unitPrice,
    compare_at: null,
    badge: null,
    category: record.category,
    interests: [],
    image: media,
    hero: media,
    gallery: record.imageUrl ? [media] : [],
    hotspots: [],
    variants: [
      {
        id: "csv-stock",
        name: "CSV stock row",
        tone: "#f2f4f6",
        inventory_sku: record.sku
      }
    ],
    bundles: [],
    story: [],
    specs: {
      SKU: record.sku,
      Inventory: String(record.stock),
      "CSV source row": String(record.sourceRow),
      "Inventory source": sourceTag
    },
    anchors: [],
    product_url: `/product/${record.productSlug}`,
    sort_order: index,
    workflow_status: "published",
    published_at: now,
    archived_at: null,
    is_visible: true,
    source_availability: sourceTag,
    source_catalog_id: `inventory:${record.sku}`,
    source_description: `${record.productName} imported from ${csvPath}.`,
    updated_at: now
  };
}

function serializeInventory(record, now) {
  return {
    product_slug: record.productSlug,
    sku: record.sku,
    variant_id: null,
    stock_status: record.stockStatus,
    quantity: record.stock,
    reserved_quantity: 0,
    reorder_threshold: 0,
    updated_by: null,
    updated_at: now
  };
}

function serializeWarehouseStock(record, now) {
  return {
    warehouse_code: warehouseCode,
    product_slug: record.productSlug,
    sku: record.sku,
    variant_id: null,
    available_quantity: record.stock,
    committed_quantity: 0,
    last_counted_at: now,
    updated_by: null,
    updated_at: now
  };
}

async function fetchInventoryCsvSourceSlugs(supabase, sourceTags) {
  const { data, error } = await supabase
    .from("mithron_products")
    .select("slug")
    .in("source_availability", sourceTags)
    .limit(5000);
  if (error) throw new Error(`mithron_products source-slug read failed: ${error.message}`);
  return (data ?? []).map((row) => row.slug).filter(Boolean);
}

async function deleteRowsForProductSlugs(supabase, table, productSlugs) {
  let deleted = 0;
  for (const slugsChunk of chunk([...new Set(productSlugs)], 200)) {
    if (!slugsChunk.length) continue;
    const { data, error } = await supabase
      .from(table)
      .delete()
      .in("product_slug", slugsChunk)
      .select("id");
    if (error) throw new Error(`${table} scoped delete failed: ${error.message}`);
    deleted += (data ?? []).length;
  }
  return deleted;
}

async function upsertChunks(supabase, table, rows, options) {
  let upserted = 0;
  for (const rowsChunk of chunk(rows, 100)) {
    const { error } = await supabase.from(table).upsert(rowsChunk, options);
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
    upserted += rowsChunk.length;
  }
  return upserted;
}

async function countCsvRows(supabase, table, sourceSlugs) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .in("product_slug", sourceSlugs);
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function main() {
  loadProjectEnv();
  installTypeScriptRuntime();

  const csvPath = process.argv[2] ? join(process.cwd(), process.argv[2]) : defaultCsvPath;
  if (!existsSync(csvPath)) throw new Error(`Inventory CSV does not exist: ${csvPath}`);

  const {
    CSV_IMPORT_SOURCE_TAG,
    CSV_IMPORT_SOURCE_TAGS,
    mapInventoryCsvRows,
    parseInventoryCsv
  } = require(join(root, "services", "inventory-csv.ts"));

  const mapped = mapInventoryCsvRows(parseInventoryCsv(readFileSync(csvPath, "utf8")));
  if (mapped.errors.length) {
    throw new Error(`CSV validation failed: ${mapped.errors.slice(0, 8).join(" ")}`);
  }
  if (!mapped.records.length) {
    throw new Error("CSV did not contain any valid inventory records.");
  }

  const now = new Date().toISOString();
  const products = mapped.records.map((record, index) => serializeProduct(record, index, now, CSV_IMPORT_SOURCE_TAG, csvPath));
  const inventory = mapped.records.map((record) => serializeInventory(record, now));
  const warehouseStock = mapped.records.map((record) => serializeWarehouseStock(record, now));
  const slugs = mapped.records.map((record) => record.productSlug);
  const supabase = createSupabaseAdminClient();
  const previousSourceSlugs = await fetchInventoryCsvSourceSlugs(supabase, [...CSV_IMPORT_SOURCE_TAGS]);

  const deleted = {
    inventory: await deleteRowsForProductSlugs(supabase, "inventory", previousSourceSlugs),
    warehouse_stock: await deleteRowsForProductSlugs(supabase, "warehouse_stock", previousSourceSlugs)
  };

  const upserted = {
    mithron_products: await upsertChunks(supabase, "mithron_products", products, { onConflict: "slug" }),
    inventory: await upsertChunks(supabase, "inventory", inventory, { onConflict: "product_slug,sku" }),
    warehouse_stock: await upsertChunks(supabase, "warehouse_stock", warehouseStock, { onConflict: "warehouse_code,product_slug,sku" })
  };

  const { error: logError } = await supabase.from("activity_logs").insert({
    action: "warehouse.csv_import",
    entity_table: "inventory",
    entity_id: "inventory-csv-import",
    severity: mapped.warnings.length ? "warning" : "info",
    metadata: {
      csv_path: csvPath,
      source: CSV_IMPORT_SOURCE_TAG,
      imported_rows: mapped.records.length,
      deleted,
      upserted,
      generated_skus: mapped.generatedSkus.length,
      warnings: mapped.warnings.slice(0, 20)
    }
  });
  if (logError) {
    console.warn(`activity_logs insert failed: ${logError.message}`);
  }

  const verified = {
    csvProducts: mapped.records.length,
    inventory: await countCsvRows(supabase, "inventory", slugs),
    warehouse_stock: await countCsvRows(supabase, "warehouse_stock", slugs),
    stockUnits: mapped.records.reduce((sum, record) => sum + record.stock, 0),
    inventoryValue: mapped.records.reduce((sum, record) => sum + record.totalValue, 0)
  };

  console.log(JSON.stringify({
    status: verified.inventory === mapped.records.length && verified.warehouse_stock === mapped.records.length ? "VERIFIED" : "PARTIAL",
    csvPath,
    source: CSV_IMPORT_SOURCE_TAG,
    deleted,
    upserted,
    verified,
    warnings: mapped.warnings.length,
    generatedSkus: mapped.generatedSkus.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
