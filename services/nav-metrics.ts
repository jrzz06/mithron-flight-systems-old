import { cache } from "react";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { readThroughCache, REDIS_CACHE_KEYS, deleteCachedKeys } from "@/lib/cache-redis";

async function countTable(table: string, filter: string, idColumn = "id"): Promise<number> {
  const config = assertSupabaseAdminConfig(process.env);
  const response = await fetch(
    `${config.url}/rest/v1/${table}?select=${encodeURIComponent(idColumn)}&${filter}&limit=1`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Prefer: "count=exact"
      },
      cache: "no-store"
    }
  );
  if (!response.ok) return 0;
  const contentRange = response.headers.get("content-range");
  if (!contentRange) return 0;
  const total = contentRange.split("/")[1];
  return Number(total ?? 0) || 0;
}

async function countRows(filter: string): Promise<number> {
  return countTable("orders", filter);
}

async function countProducts(filter: string): Promise<number> {
  return countTable("mithron_products", filter, "slug");
}

export type AdminNavMetricsPayload = {
  pendingSupplierApprovals: number;
  pendingOrdersReview: number;
  newEnquiries: number;
  newContactRequests: number;
};

export type WarehouseNavMetricsPayload = {
  fulfillmentPending: number;
};

export type SupplierNavMetricsPayload = {
  pendingReview: number;
  needsAction: number;
  inventoryAlerts: number;
};

async function countSupplierProducts(supplierId: string, filter: string): Promise<number> {
  const config = assertSupabaseAdminConfig(process.env);
  const response = await fetch(
    `${config.url}/rest/v1/mithron_products?select=slug&supplier_id=eq.${encodeURIComponent(supplierId)}&${filter}&limit=1`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Prefer: "count=exact"
      },
      cache: "no-store"
    }
  );
  if (!response.ok) return 0;
  const contentRange = response.headers.get("content-range");
  if (!contentRange) return 0;
  const total = contentRange.split("/")[1];
  return Number(total ?? 0) || 0;
}

async function countSupplierInventoryAlerts(supplierId: string): Promise<number> {
  const config = assertSupabaseAdminConfig(process.env);
  const productsResponse = await fetch(
    `${config.url}/rest/v1/mithron_products?select=slug&supplier_id=eq.${encodeURIComponent(supplierId)}&limit=500`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      },
      cache: "no-store"
    }
  );
  if (!productsResponse.ok) return 0;
  const products = (await productsResponse.json()) as Array<{ slug?: string }>;
  const slugs = products.map((row) => String(row.slug ?? "").trim()).filter(Boolean);
  if (!slugs.length) return 0;

  const slugFilter = slugs.map((slug) => encodeURIComponent(slug)).join(",");
  const inventoryResponse = await fetch(
    `${config.url}/rest/v1/inventory?select=product_slug&product_slug=in.(${slugFilter})&stock_status=in.(low_stock,out_of_stock)&limit=1`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Prefer: "count=exact"
      },
      cache: "no-store"
    }
  );
  if (!inventoryResponse.ok) return 0;
  const contentRange = inventoryResponse.headers.get("content-range");
  if (!contentRange) return 0;
  const total = contentRange.split("/")[1];
  return Number(total ?? 0) || 0;
}

export const getAdminNavMetricsPayload = cache(async (): Promise<AdminNavMetricsPayload> => {
  return readThroughCache(REDIS_CACHE_KEYS.adminNavMetrics, 30, async () => {
    const [pendingSupplierApprovals, pendingOrdersReview, newEnquiries, newContactRequests] = await Promise.all([
      countProducts("workflow_status=eq.pending_review"),
      countRows("status=in.(paid,admin_review,pending_payment)"),
      countTable("enquiries", "status=eq.new"),
      countTable("contact_requests", "status=eq.new")
    ]);
    return {
      pendingSupplierApprovals,
      pendingOrdersReview,
      newEnquiries,
      newContactRequests
    };
  });
});

export const getWarehouseNavMetricsPayload = cache(async (): Promise<WarehouseNavMetricsPayload> => {
  return readThroughCache(REDIS_CACHE_KEYS.warehouseNavMetrics, 30, async () => ({
    fulfillmentPending: await countRows("fulfillment_status=in.(pending,processing,picked,packed,ready_to_dispatch)&status=in.(confirmed,assigned,processing,packed,dispatched,in_transit)")
  }));
});

export const getSupplierNavMetricsPayload = cache(async (supplierId: string): Promise<SupplierNavMetricsPayload> => {
  return readThroughCache(REDIS_CACHE_KEYS.supplierNavMetrics(supplierId), 30, async () => ({
    pendingReview: await countSupplierProducts(supplierId, "workflow_status=eq.pending_review"),
    needsAction: await countSupplierProducts(supplierId, "workflow_status=in.(draft,rejected)"),
    inventoryAlerts: await countSupplierInventoryAlerts(supplierId)
  }));
});

export async function invalidateNavMetricsCacheEntries() {
  await deleteCachedKeys([REDIS_CACHE_KEYS.adminNavMetrics, REDIS_CACHE_KEYS.warehouseNavMetrics]);
}

export async function invalidateSupplierNavMetricsCache(supplierId: string) {
  await deleteCachedKeys([REDIS_CACHE_KEYS.supplierNavMetrics(supplierId)]);
}
