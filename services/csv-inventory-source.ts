import { getSupabaseAdminConfig } from "@/lib/env";
import { getInventoryStockMetrics, type InventoryStockMetrics } from "@/services/inventory-metrics";
import { buildSimpleInventoryRows, type SimpleInventoryRow } from "@/services/simple-inventory-view";
import { getCheckoutWarehouseCode } from "@/services/warehouse-config";
type EnvSource = Record<string, string | undefined>;
type AdminRow = Record<string, unknown>;

export type CatalogFilter = "active" | "archived" | "all";

type CsvInventoryResult = {
  rows: SimpleInventoryRow[];
  blockedReason?: string;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  totalProductCount: number;
  catalogFilter: CatalogFilter;
  inventoryMetrics: InventoryStockMetrics;
};

export const CSV_INVENTORY_PAGE_SIZE = 80;
const CSV_INVENTORY_EXPORT_LIMIT = 1000;

type CsvInventoryOptions = {
  env?: EnvSource;
  page?: number;
  pageSize?: number;
  all?: boolean;
  publishedOnly?: boolean;
  catalogFilter?: CatalogFilter;
};

const ACTIVE_CATALOG_FILTER = "workflow_status=neq.archived&archived_at=is.null&merge_status=neq.archived_merged";
const ARCHIVED_CATALOG_FILTER = "or=(workflow_status.eq.archived,archived_at.not.is.null)";
const PUBLISHED_STOREFRONT_FILTER = "workflow_status=eq.published&is_visible=eq.true&archived_at=is.null&merge_status=neq.archived_merged";

function isOptions(value: EnvSource | CsvInventoryOptions): value is CsvInventoryOptions {
  return "env" in value || "page" in value || "pageSize" in value || "all" in value || "publishedOnly" in value || "catalogFilter" in value;
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function columnInFilter(column: string, slugs: string[]) {
  return `${column}=in.(${slugs.map((slug) => encodeURIComponent(slug)).join(",")})`;
}

function catalogFilterQuery(catalogFilter: CatalogFilter, publishedOnly: boolean) {
  if (publishedOnly) return PUBLISHED_STOREFRONT_FILTER;
  if (catalogFilter === "archived") return ARCHIVED_CATALOG_FILTER;
  if (catalogFilter === "active") return ACTIVE_CATALOG_FILTER;
  return "";
}

function getAdminHeaders(config: Extract<ReturnType<typeof getSupabaseAdminConfig>, { configured: true }>) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

async function fetchRows<T extends AdminRow>(
  config: Extract<ReturnType<typeof getSupabaseAdminConfig>, { configured: true }>,
  table: string,
  query: string
) {
  const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
    headers: getAdminHeaders(config),
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = (await response.text()).trim().slice(0, 240);
    throw new Error(
      `${table} read failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`
    );
  }

  return (await response.json()) as T[];
}

async function countProducts(
  config: Extract<ReturnType<typeof getSupabaseAdminConfig>, { configured: true }>,
  catalogFilter: CatalogFilter,
  publishedOnly = false
) {
  const filter = catalogFilterQuery(catalogFilter, publishedOnly);
  const query = filter ? `select=slug&${filter}` : "select=slug";
  const response = await fetch(`${config.url}/rest/v1/mithron_products?${query}`, {
    headers: {
      ...getAdminHeaders(config),
      Prefer: "count=exact"
    },
    cache: "no-store"
  });
  if (!response.ok) return 0;
  const contentRange = response.headers.get("content-range");
  if (!contentRange) {
    const rows = await response.json() as AdminRow[];
    return rows.length;
  }
  const total = contentRange.split("/")[1];
  return Number(total) || 0;
}

export async function loadCsvInventoryRows(input: EnvSource | CsvInventoryOptions = process.env): Promise<CsvInventoryResult> {
  const options = isOptions(input) ? input : { env: input };
  const env = options.env ?? process.env;
  const page = positiveInteger(options.page, 1);
  const pageSize = options.all ? CSV_INVENTORY_EXPORT_LIMIT : Math.min(positiveInteger(options.pageSize, CSV_INVENTORY_PAGE_SIZE), CSV_INVENTORY_PAGE_SIZE);
  const offset = options.all ? 0 : (page - 1) * pageSize;
  const productLimit = options.all ? CSV_INVENTORY_EXPORT_LIMIT : pageSize + 1;
  const publishedOnly = options.publishedOnly === true;
  const catalogFilter: CatalogFilter = options.catalogFilter ?? (publishedOnly ? "active" : "all");
  const config = getSupabaseAdminConfig(env);
  const emptyMetrics: InventoryStockMetrics = {
    totalInventoryItems: 0,
    inStock: 0,
    lowStock: 0,
    outOfStock: 0
  };

  if (!config.configured) {
    return {
      rows: [],
      blockedReason: config.message,
      page,
      pageSize,
      hasNextPage: false,
      totalProductCount: 0,
      catalogFilter,
      inventoryMetrics: emptyMetrics
    };
  }

  try {
    const statusFilter = catalogFilterQuery(catalogFilter, publishedOnly);
    const productQuery = [
      "select=slug,name,category,price,image,hero,workflow_status,archived_at,is_visible,merge_status,supplier_id,updated_at",
      statusFilter,
      "order=sort_order.asc",
      `limit=${productLimit}`,
      options.all ? "" : `offset=${offset}`
    ].filter(Boolean).join("&");

    const [productsPage, totalProductCount, inventoryMetrics] = await Promise.all([
      fetchRows<AdminRow>(config, "mithron_products", productQuery),
      countProducts(config, catalogFilter, publishedOnly),
      getInventoryStockMetrics(env)
    ]);

    const products = options.all ? productsPage : productsPage.slice(0, pageSize);
    const hasNextPage = !options.all && productsPage.length > pageSize;
    const productSlugList = products.map((row) => String(row.slug ?? "")).filter(Boolean);

    if (!productSlugList.length) {
      return {
        rows: [],
        page,
        pageSize,
        hasNextPage: false,
        totalProductCount,
        catalogFilter,
        inventoryMetrics
      };
    }

    const relationLimit = options.all ? CSV_INVENTORY_EXPORT_LIMIT : pageSize + 10;
    const inventorySlugFilter = columnInFilter("product_slug", productSlugList);

    const supplierIds = [...new Set(
      products
        .map((row) => String(row.supplier_id ?? ""))
        .filter(Boolean)
    )];
    const supplierQuery = supplierIds.length
      ? `select=id,display_name,email&id=in.(${supplierIds.map(encodeURIComponent).join(",")})`
      : null;

    const [inventory, checkoutWarehouseCode, suppliers] = await Promise.all([
      fetchRows<AdminRow>(
        config,
        "inventory",
        [
          "select=id,product_slug,sku,variant_id,stock_status,quantity,reserved_quantity,reorder_threshold,updated_at,created_at",
          inventorySlugFilter,
          "order=updated_at.desc",
          `limit=${relationLimit}`
        ].join("&")
      ),
      getCheckoutWarehouseCode(env),
      supplierQuery
        ? fetchRows<AdminRow>(config, "profiles", supplierQuery)
        : Promise.resolve([] as AdminRow[])
    ]);

    const supplierNameById = new Map(
      suppliers.map((supplier) => [String(supplier.id ?? ""), String(supplier.display_name ?? supplier.email ?? "Supplier")])
    );
    const productsWithSupplier = products.map((product) => ({
      ...product,
      supplier_name: supplierNameById.get(String(product.supplier_id ?? "")) ?? ""
    }));

    return {
      page,
      pageSize,
      hasNextPage,
      totalProductCount,
      catalogFilter,
      inventoryMetrics,
      rows: buildSimpleInventoryRows(productsWithSupplier, inventory, checkoutWarehouseCode)
    };
  } catch (error) {
    return {
      rows: [],
      page,
      pageSize,
      hasNextPage: false,
      totalProductCount: 0,
      catalogFilter,
      inventoryMetrics: emptyMetrics,
      blockedReason: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function getCsvInventoryRows(input: EnvSource | CsvInventoryOptions = process.env): Promise<CsvInventoryResult> {
  const options = isOptions(input) ? input : { env: input };
  if (options.all) {
    return loadCsvInventoryRows(input);
  }

  const page = positiveInteger(options.page, 1);
  const pageSize = Math.min(positiveInteger(options.pageSize, CSV_INVENTORY_PAGE_SIZE), CSV_INVENTORY_PAGE_SIZE);
  const catalogFilter: CatalogFilter = options.catalogFilter ?? (options.publishedOnly === true ? "active" : "all");
  const { readThroughCache, REDIS_CACHE_KEYS } = await import("@/lib/cache-redis");
  const { cacheControlPlaneRead } = await import("@/lib/control-plane/query-cache");

  return readThroughCache(
    REDIS_CACHE_KEYS.controlPlaneCsvInventory(page, pageSize, catalogFilter),
    30,
    () =>
      cacheControlPlaneRead(
        ["csv-inventory", String(page), String(pageSize), catalogFilter],
        () => loadCsvInventoryRows(input),
        { revalidate: 30, tags: ["admin-inventory", "control-plane-inventory"] }
      )
  );
}
