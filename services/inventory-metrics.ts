import { getSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type EnvSource = Record<string, string | undefined>;

export type ProductCatalogMetrics = {
  activeProducts: number;
  archivedProducts: number;
  totalProducts: number;
};

export type InventoryStockMetrics = {
  totalInventoryItems: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
};

export type InventoryParityReport = {
  synchronized: boolean;
  productCount: number;
  inventoryCount: number;
  missingInventory: number;
  duplicateInventorySlugs: number;
  orphanInventory: number;
};

const ACTIVE_PRODUCT_QUERY =
  "select=slug&workflow_status=neq.archived&archived_at=is.null&merge_status=neq.archived_merged";

const ARCHIVED_PRODUCT_QUERY =
  "select=slug&or=(workflow_status.eq.archived,archived_at.not.is.null)";

/** Opt-in row scan fallback when parity RPC is missing. Default is a capped HEAD/count path. */
const PARITY_ROW_SCAN_LIMIT = 500;
const ENABLE_PARITY_ROW_SCAN = process.env.INVENTORY_PARITY_ROW_SCAN === "1";

function adminHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: "count=exact"
  };
}

async function countWithQuery(
  config: Extract<ReturnType<typeof getSupabaseAdminConfig>, { configured: true }>,
  table: string,
  query: string
): Promise<number> {
  const response = await fetchWithTimeout(`${config.url}/rest/v1/${table}?${query}`, {
    method: "HEAD",
    headers: adminHeaders(config.serviceRoleKey),
    cache: "no-store"
  });
  if (!response.ok) return 0;
  const range = response.headers.get("content-range");
  if (!range?.includes("/")) return 0;
  const total = Number(range.split("/").at(-1));
  return Number.isFinite(total) ? total : 0;
}

export async function getProductCatalogMetrics(env: EnvSource = process.env): Promise<ProductCatalogMetrics> {
  const { readThroughCache, REDIS_CACHE_KEYS } = await import("@/lib/cache-redis");
  const { cacheControlPlaneRead } = await import("@/lib/control-plane/query-cache");
  return readThroughCache(
    REDIS_CACHE_KEYS.controlPlaneProductManagerCatalogMetrics,
    30,
    () =>
      cacheControlPlaneRead(
        ["control-plane", "product-catalog-metrics"],
        () => resolveProductCatalogMetrics(env),
        { revalidate: 30, tags: ["admin-products", "control-plane-catalog"] }
      )
  );
}

async function resolveProductCatalogMetrics(env: EnvSource = process.env): Promise<ProductCatalogMetrics> {
  const config = getSupabaseAdminConfig(env);
  if (!config.configured) {
    return { activeProducts: 0, archivedProducts: 0, totalProducts: 0 };
  }

  const [activeProducts, archivedProducts, totalProducts] = await Promise.all([
    countWithQuery(config, "mithron_products", ACTIVE_PRODUCT_QUERY),
    countWithQuery(config, "mithron_products", ARCHIVED_PRODUCT_QUERY),
    countWithQuery(config, "mithron_products", "select=slug")
  ]);

  return { activeProducts, archivedProducts, totalProducts };
}

export async function getInventoryStockMetrics(env: EnvSource = process.env): Promise<InventoryStockMetrics> {
  const { readThroughCache, REDIS_CACHE_KEYS } = await import("@/lib/cache-redis");
  const { cacheControlPlaneRead } = await import("@/lib/control-plane/query-cache");
  return readThroughCache(
    REDIS_CACHE_KEYS.controlPlaneInventoryMetrics,
    30,
    () =>
      cacheControlPlaneRead(
        ["control-plane", "inventory-stock-metrics"],
        () => resolveInventoryStockMetrics(env),
        { revalidate: 30, tags: ["inventory-metrics"] }
      )
  );
}

async function resolveInventoryStockMetrics(env: EnvSource = process.env): Promise<InventoryStockMetrics> {
  const config = getSupabaseAdminConfig(env);
  if (!config.configured) {
    return { totalInventoryItems: 0, inStock: 0, lowStock: 0, outOfStock: 0 };
  }

  const rpcResponse = await fetchWithTimeout(`${config.url}/rest/v1/rpc/get_inventory_stock_metrics`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: "{}",
    cache: "no-store"
  });

  if (rpcResponse.ok) {
    const payload = (await rpcResponse.json()) as Partial<InventoryStockMetrics>;
    return {
      totalInventoryItems: Number(payload.totalInventoryItems ?? 0),
      inStock: Number(payload.inStock ?? 0),
      lowStock: Number(payload.lowStock ?? 0),
      outOfStock: Number(payload.outOfStock ?? 0)
    };
  }

  const [totalInventoryItems, inStock, lowStockStatus, outOfStockStatus, outOfStockQty] = await Promise.all([
    countWithQuery(config, "inventory", "select=product_slug"),
    countWithQuery(config, "inventory", "select=product_slug&stock_status=eq.available&quantity=gt.0"),
    countWithQuery(config, "inventory", "select=product_slug&stock_status=eq.low_stock"),
    countWithQuery(config, "inventory", "select=product_slug&stock_status=eq.out_of_stock"),
    countWithQuery(config, "inventory", "select=product_slug&quantity=eq.0")
  ]);

  return {
    totalInventoryItems,
    inStock,
    lowStock: lowStockStatus,
    outOfStock: Math.max(outOfStockStatus, outOfStockQty)
  };
}

function emptyParityReport(): InventoryParityReport {
  return {
    synchronized: true,
    productCount: 0,
    inventoryCount: 0,
    missingInventory: 0,
    duplicateInventorySlugs: 0,
    orphanInventory: 0
  };
}

function finalizeParityReport(partial: Partial<InventoryParityReport>): InventoryParityReport {
  const productCount = Number(partial.productCount ?? 0);
  const inventoryCount = Number(partial.inventoryCount ?? 0);
  const missingInventory = Number(partial.missingInventory ?? 0);
  const duplicateInventorySlugs = Number(partial.duplicateInventorySlugs ?? 0);
  const orphanInventory = Number(partial.orphanInventory ?? 0);
  return {
    synchronized:
      productCount === inventoryCount
      && missingInventory === 0
      && duplicateInventorySlugs === 0
      && orphanInventory === 0,
    productCount,
    inventoryCount,
    missingInventory,
    duplicateInventorySlugs,
    orphanInventory
  };
}

async function assertInventoryProductParityViaRowScan(
  config: Extract<ReturnType<typeof getSupabaseAdminConfig>, { configured: true }>
): Promise<InventoryParityReport> {
  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json"
  };
  const limit = ENABLE_PARITY_ROW_SCAN ? 5000 : PARITY_ROW_SCAN_LIMIT;

  const [productsResponse, inventoryResponse] = await Promise.all([
    fetchWithTimeout(`${config.url}/rest/v1/mithron_products?select=slug&limit=${limit}`, { headers, cache: "no-store" }),
    fetchWithTimeout(`${config.url}/rest/v1/inventory?select=product_slug&limit=${limit}`, { headers, cache: "no-store" })
  ]);

  const products = productsResponse.ok ? (await productsResponse.json() as Array<{ slug?: string }>) : [];
  const inventory = inventoryResponse.ok ? (await inventoryResponse.json() as Array<{ product_slug?: string }>) : [];

  const productSlugs = new Set(products.map((row) => String(row.slug ?? "").trim()).filter(Boolean));
  const inventorySlugCounts = new Map<string, number>();
  for (const row of inventory) {
    const slug = String(row.product_slug ?? "").trim();
    if (!slug) continue;
    inventorySlugCounts.set(slug, (inventorySlugCounts.get(slug) ?? 0) + 1);
  }

  const inventorySlugs = new Set(inventorySlugCounts.keys());
  const missingInventory = [...productSlugs].filter((slug) => !inventorySlugs.has(slug)).length;
  const duplicateInventorySlugs = [...inventorySlugCounts.values()].filter((count) => count > 1).length;
  const orphanInventory = [...inventorySlugs].filter((slug) => !productSlugs.has(slug)).length;

  return finalizeParityReport({
    productCount: productSlugs.size,
    inventoryCount: inventory.length,
    missingInventory,
    duplicateInventorySlugs,
    orphanInventory
  });
}

export async function assertInventoryProductParity(env: EnvSource = process.env): Promise<InventoryParityReport> {
  const config = getSupabaseAdminConfig(env);
  if (!config.configured) {
    return emptyParityReport();
  }

  const rpcResponse = await fetchWithTimeout(`${config.url}/rest/v1/rpc/get_inventory_parity_counts`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: "{}",
    cache: "no-store"
  });

  if (rpcResponse.ok) {
    const payload = (await rpcResponse.json()) as Partial<InventoryParityReport>;
    return finalizeParityReport(payload);
  }

  return assertInventoryProductParityViaRowScan(config);
}
