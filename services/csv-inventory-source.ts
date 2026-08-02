import {
  ACTIVE_PRODUCT_FILTER,
  ARCHIVED_PRODUCT_FILTER,
  PUBLISHED_STOREFRONT_FILTER
} from "@/lib/catalog-product-filters";
import { getSupabaseAdminConfig } from "@/lib/env";
import { getInventoryStockMetrics, type InventoryStockMetrics } from "@/services/inventory-metrics";
import { buildSimpleInventoryRows, type SimpleInventoryRow } from "@/services/simple-inventory-view";
import { getCheckoutWarehouseCode } from "@/services/warehouse-config";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type EnvSource = Record<string, string | undefined>;
type AdminRow = Record<string, unknown>;

export type CatalogFilter = "active" | "archived" | "all";

export type CsvInventoryResult = {
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

const ACTIVE_CATALOG_FILTER = ACTIVE_PRODUCT_FILTER;
const ARCHIVED_CATALOG_FILTER = ARCHIVED_PRODUCT_FILTER;

const EMPTY_METRICS: InventoryStockMetrics = {
  totalInventoryItems: 0,
  inStock: 0,
  lowStock: 0,
  outOfStock: 0
};

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

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/** Soft fetch — returns rows + error instead of throwing so secondary failures do not wipe the page. */
async function fetchRowsSafe<T extends AdminRow>(
  config: Extract<ReturnType<typeof getSupabaseAdminConfig>, { configured: true }>,
  table: string,
  query: string
): Promise<{ rows: T[]; error: string | null }> {
  try {
    const response = await fetchWithTimeout(`${config.url}/rest/v1/${table}?${query}`, {
      headers: getAdminHeaders(config),
      cache: "no-store"
    });

    if (!response.ok) {
      const detail = (await response.text()).trim().slice(0, 240);
      return {
        rows: [],
        error: `${table} read failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`
      };
    }

    return { rows: (await response.json()) as T[], error: null };
  } catch (error) {
    return { rows: [], error: errorMessage(error, `${table} read failed.`) };
  }
}

async function countProducts(
  config: Extract<ReturnType<typeof getSupabaseAdminConfig>, { configured: true }>,
  catalogFilter: CatalogFilter,
  publishedOnly = false
) {
  const filter = catalogFilterQuery(catalogFilter, publishedOnly);
  const query = filter ? `select=slug&${filter}` : "select=slug";
  try {
    const response = await fetchWithTimeout(`${config.url}/rest/v1/mithron_products?${query}`, {
      headers: {
        ...getAdminHeaders(config),
        Prefer: "count=exact"
      },
      cache: "no-store"
    });
    if (!response.ok) return 0;
    const contentRange = response.headers.get("content-range");
    if (!contentRange) {
      const rows = (await response.json()) as AdminRow[];
      return rows.length;
    }
    const total = contentRange.split("/")[1];
    return Number(total) || 0;
  } catch {
    return 0;
  }
}

function shouldSkipInventoryCache(result: CsvInventoryResult) {
  if (result.blockedReason) return true;
  // Empty page while metrics say stock exists — do not trust a cached transient miss.
  if (!result.rows.length && result.inventoryMetrics.totalInventoryItems > 0) return true;
  return false;
}

export async function loadCsvInventoryRows(input: EnvSource | CsvInventoryOptions = process.env): Promise<CsvInventoryResult> {
  const options = isOptions(input) ? input : { env: input };
  const env = options.env ?? process.env;
  const page = positiveInteger(options.page, 1);
  const pageSize = options.all
    ? CSV_INVENTORY_EXPORT_LIMIT
    : Math.min(positiveInteger(options.pageSize, CSV_INVENTORY_PAGE_SIZE), CSV_INVENTORY_PAGE_SIZE);
  const offset = options.all ? 0 : (page - 1) * pageSize;
  const productLimit = options.all ? CSV_INVENTORY_EXPORT_LIMIT : pageSize + 1;
  const publishedOnly = options.publishedOnly === true;
  const catalogFilter: CatalogFilter = options.catalogFilter ?? (publishedOnly ? "active" : "all");
  const config = getSupabaseAdminConfig(env);

  if (!config.configured) {
    return {
      rows: [],
      blockedReason: config.message,
      page,
      pageSize,
      hasNextPage: false,
      totalProductCount: 0,
      catalogFilter,
      inventoryMetrics: EMPTY_METRICS
    };
  }

  const statusFilter = catalogFilterQuery(catalogFilter, publishedOnly);
  const productQuery = [
    "select=slug,name,category,price,image,hero,workflow_status,archived_at,is_visible,merge_status,supplier_id,updated_at",
    statusFilter,
    "order=sort_order.asc",
    `limit=${productLimit}`,
    options.all ? "" : `offset=${offset}`
  ]
    .filter(Boolean)
    .join("&");

  const [productsResult, totalProductCount, inventoryMetricsResult] = await Promise.all([
    fetchRowsSafe<AdminRow>(config, "mithron_products", productQuery),
    countProducts(config, catalogFilter, publishedOnly),
    getInventoryStockMetrics(env).then(
      (metrics) => ({ metrics, error: null as string | null }),
      (error) => ({ metrics: EMPTY_METRICS, error: errorMessage(error, "Inventory metrics unavailable.") })
    )
  ]);

  const inventoryMetrics = inventoryMetricsResult.metrics;
  const productErrors = [productsResult.error, inventoryMetricsResult.error].filter(Boolean) as string[];

  if (productsResult.error && !productsResult.rows.length) {
    return {
      rows: [],
      page,
      pageSize,
      hasNextPage: false,
      totalProductCount,
      catalogFilter,
      inventoryMetrics,
      blockedReason: productsResult.error
    };
  }

  const products = options.all ? productsResult.rows : productsResult.rows.slice(0, pageSize);
  const hasNextPage = !options.all && productsResult.rows.length > pageSize;
  const productSlugList = products.map((row) => String(row.slug ?? "")).filter(Boolean);

  if (!productSlugList.length) {
    return {
      rows: [],
      page,
      pageSize,
      hasNextPage: false,
      totalProductCount,
      catalogFilter,
      inventoryMetrics,
      blockedReason: productErrors[0]
    };
  }

  const relationLimit = Math.max(
    options.all ? CSV_INVENTORY_EXPORT_LIMIT : pageSize + 10,
    productSlugList.length
  );
  const inventorySlugFilter = columnInFilter("product_slug", productSlugList);

  const supplierIds = [
    ...new Set(products.map((row) => String(row.supplier_id ?? "")).filter(Boolean))
  ];
  const supplierQuery = supplierIds.length
    ? `select=id,display_name,email&id=in.(${supplierIds.map(encodeURIComponent).join(",")})`
    : null;

  const [inventoryResult, checkoutWarehouseCode, suppliersResult] = await Promise.all([
    fetchRowsSafe<AdminRow>(
      config,
      "inventory",
      [
        "select=id,product_slug,sku,variant_id,stock_status,quantity,reserved_quantity,reorder_threshold,updated_at,created_at",
        inventorySlugFilter,
        "order=updated_at.desc",
        `limit=${relationLimit}`
      ].join("&")
    ),
    getCheckoutWarehouseCode(env).catch(() => ""),
    supplierQuery
      ? fetchRowsSafe<AdminRow>(config, "profiles", supplierQuery)
      : Promise.resolve({ rows: [] as AdminRow[], error: null as string | null })
  ]);

  const secondaryErrors = [...productErrors, inventoryResult.error, suppliersResult.error].filter(
    Boolean
  ) as string[];

  const supplierNameById = new Map(
    suppliersResult.rows.map((supplier) => [
      String(supplier.id ?? ""),
      String(supplier.display_name ?? supplier.email ?? "Supplier")
    ])
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
    rows: buildSimpleInventoryRows(productsWithSupplier, inventoryResult.rows, checkoutWarehouseCode),
    blockedReason: secondaryErrors[0]
  };
}

export async function getCsvInventoryRows(
  input: EnvSource | CsvInventoryOptions = process.env
): Promise<CsvInventoryResult> {
  const options = isOptions(input) ? input : { env: input };
  if (options.all) {
    return loadCsvInventoryRows(input);
  }

  const page = positiveInteger(options.page, 1);
  const pageSize = Math.min(positiveInteger(options.pageSize, CSV_INVENTORY_PAGE_SIZE), CSV_INVENTORY_PAGE_SIZE);
  const catalogFilter: CatalogFilter =
    options.catalogFilter ?? (options.publishedOnly === true ? "active" : "all");
  // No Redis on admin pages — see services/admin.ts getAdminDashboardSnapshot comment.
  const { cacheControlPlaneRead } = await import("@/lib/control-plane/query-cache");

  const cached = await cacheControlPlaneRead(
    ["csv-inventory", String(page), String(pageSize), catalogFilter],
    () => loadCsvInventoryRows(input),
    { revalidate: 30, tags: ["admin-inventory", "control-plane-inventory"] }
  );

  // Never serve a poisoned empty/error payload — bypass cache and load fresh.
  if (shouldSkipInventoryCache(cached)) {
    return loadCsvInventoryRows(input);
  }
  return cached;
}
