import { cache } from "react";
import { getSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

async function countTable(table: string, filter: string, idColumn = "id"): Promise<number> {
  const config = getSupabaseAdminConfig(process.env);
  if (!config.configured) return 0;
  const response = await fetchWithTimeout(
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
  const config = getSupabaseAdminConfig(process.env);
  if (!config.configured) return 0;
  const response = await fetchWithTimeout(
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
  const config = getSupabaseAdminConfig(process.env);
  if (!config.configured) return 0;

  const rpcResponse = await fetchWithTimeout(`${config.url}/rest/v1/rpc/get_supplier_inventory_alert_count`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ p_supplier_id: supplierId }),
    cache: "no-store"
  });
  if (rpcResponse.ok) {
    const payload = await rpcResponse.json();
    const count = typeof payload === "number" ? payload : Number(payload);
    if (Number.isFinite(count)) return count;
  }

  const productsResponse = await fetchWithTimeout(
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
  const inventoryResponse = await fetchWithTimeout(
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
// No Redis on admin/warehouse/supplier nav badges — these are staff-facing counts
// (pending approvals, orders needing review, fulfillment queue) where a stale badge
// is actively misleading. React `cache()` still dedupes within a single request.
export const getAdminNavMetricsPayload = cache(async (): Promise<AdminNavMetricsPayload> => {
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

export const getWarehouseNavMetricsPayload = cache(async (): Promise<WarehouseNavMetricsPayload> => ({
  fulfillmentPending: await countRows("fulfillment_status=in.(pending,packing)&status=in.(confirmed,assigned,processing,packed,dispatched,in_transit)")
}));

export const getSupplierNavMetricsPayload = cache(async (supplierId: string): Promise<SupplierNavMetricsPayload> => {
  const [pendingReview, needsAction, inventoryAlerts] = await Promise.all([
    countSupplierProducts(supplierId, "workflow_status=eq.pending_review"),
    countSupplierProducts(supplierId, "workflow_status=in.(draft,rejected)"),
    countSupplierInventoryAlerts(supplierId)
  ]);
  return { pendingReview, needsAction, inventoryAlerts };
});
// Kept as no-ops (rather than removed) so existing call sites that invalidate nav-metrics
// after a write don't need to change; there is no Redis cache left to clear.
export async function invalidateNavMetricsCacheEntries() {}

export async function invalidateSupplierNavMetricsCache(_supplierId: string) {}
