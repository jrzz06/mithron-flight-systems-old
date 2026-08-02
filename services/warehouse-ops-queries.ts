import { getSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import {
  orderMetadata,
  warehouseCustomerName,
  warehouseCustomerPhone
} from "@/lib/warehouse/order-helpers";
import {
  buildArchiveCsvDocument,
  operationalArchiveHotCutoffIso
} from "@/services/data-archive";
import type { WarehouseScope } from "@/services/warehouse-scope";
import { filterOrdersForWarehouseScope } from "@/services/warehouse-scope";

type EnvSource = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

export const WAREHOUSE_DASHBOARD_EXPORT_MAX_ROWS = 5_000;
export const WAREHOUSE_HISTORY_LIST_LIMIT = 200;
export const WAREHOUSE_DASHBOARD_LIST_LIMIT = 40;

const OPEN_FULFILLMENT_EXCLUDE = "dispatched,delivered,cancelled,returned,shipped,in_transit";
const DISPATCHED_STATUSES = "dispatched,delivered";

const LEAN_ORDER_SELECT =
  "id,order_number,customer_email,status,payment_status,fulfillment_status,total,currency,metadata,created_at,updated_at";

const LEAN_SHIPMENT_SELECT =
  "id,order_id,carrier_name,tracking_number,updated_at,created_at";

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** PostgREST warehouse scope filter matching getWarehouseDashboardOrderKpis. */
export function warehouseScopeQueryFilter(input: {
  isGlobal: boolean;
  warehouseCode: string;
  defaultWarehouseCode: string;
}) {
  if (input.isGlobal || !input.warehouseCode) return "";
  const code = encodeURIComponent(input.warehouseCode);
  if (input.warehouseCode === input.defaultWarehouseCode) {
    return `&or=(metadata->>assigned_warehouse_code.eq.${code},metadata->>assigned_warehouse_code.is.null)`;
  }
  return `&metadata->>assigned_warehouse_code=eq.${code}`;
}

export type WarehouseLeanOrderRow = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  total: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
  carrier: string;
  trackingNumber: string;
};

function mapLeanOrder(
  order: JsonRecord,
  shipment?: JsonRecord | null
): WarehouseLeanOrderRow {
  return {
    id: text(order.id),
    orderNumber: text(order.order_number, text(order.id)),
    customerName: warehouseCustomerName(order),
    customerPhone: warehouseCustomerPhone(order),
    customerEmail: text(order.customer_email, "—"),
    fulfillmentStatus: text(order.fulfillment_status, "pending"),
    paymentStatus: text(order.payment_status, "—"),
    total: String(order.total ?? "—"),
    currency: text(order.currency, ""),
    createdAt: text(order.created_at),
    updatedAt: text(order.updated_at),
    carrier: text(shipment?.carrier_name, "—"),
    trackingNumber: text(shipment?.tracking_number, "—")
  };
}

async function fetchLeanOrders(
  query: string,
  env: EnvSource
): Promise<{ rows: JsonRecord[]; available: boolean; blockedReason?: string }> {
  const config = getSupabaseAdminConfig(env);
  if (!config.configured) {
    return { rows: [], available: false, blockedReason: config.message };
  }
  try {
    const response = await fetchWithTimeout(
      `${config.url}/rest/v1/orders?${query}`,
      { headers: headers(config.serviceRoleKey), cache: "no-store" }
    );
    if (!response.ok) {
      return { rows: [], available: false, blockedReason: `${response.status} ${response.statusText}` };
    }
    return { rows: (await response.json()) as JsonRecord[], available: true };
  } catch (error) {
    return {
      rows: [],
      available: false,
      blockedReason: error instanceof Error ? error.message : "Orders unavailable."
    };
  }
}

async function fetchShipmentsForOrders(orderIds: string[], env: EnvSource) {
  if (!orderIds.length) return [] as JsonRecord[];
  const config = getSupabaseAdminConfig(env);
  if (!config.configured) return [];
  const filter = orderIds.map((id) => encodeURIComponent(id)).join(",");
  try {
    const response = await fetchWithTimeout(
      `${config.url}/rest/v1/shipments?select=${LEAN_SHIPMENT_SELECT}&order_id=in.(${filter})&order=updated_at.desc&limit=500`,
      { headers: headers(config.serviceRoleKey), cache: "no-store" }
    );
    if (!response.ok) return [];
    return (await response.json()) as JsonRecord[];
  } catch {
    return [];
  }
}

/**
 * Open (not-yet-dispatched) orders for the Today dashboard list.
 * Server-filters by fulfillment_status — not “newest N then hope”.
 */
export async function listWarehouseDashboardOpenOrders(input: {
  scope: WarehouseScope;
  defaultWarehouseCode: string;
  limit?: number;
  env?: EnvSource;
}) {
  const env = input.env ?? process.env;
  const limit = Math.min(Math.max(1, input.limit ?? WAREHOUSE_DASHBOARD_LIST_LIMIT), 100);
  const hotCutoff = encodeURIComponent(operationalArchiveHotCutoffIso());
  const warehouseFilter = warehouseScopeQueryFilter({
    isGlobal: input.scope.isGlobal,
    warehouseCode: input.scope.warehouseCode,
    defaultWarehouseCode: input.defaultWarehouseCode
  });
  const query =
    `select=${LEAN_ORDER_SELECT}`
    + `&created_at=gte.${hotCutoff}`
    + `&fulfillment_status=not.in.(${OPEN_FULFILLMENT_EXCLUDE})`
    + warehouseFilter
    + `&order=created_at.desc&limit=${limit}`;

  const result = await fetchLeanOrders(query, env);
  const scoped = filterOrdersForWarehouseScope(
    result.rows as Array<Record<string, unknown>>,
    input.scope,
    input.defaultWarehouseCode
  );
  return {
    available: result.available,
    blockedReason: result.blockedReason,
    rows: scoped.map((order) => mapLeanOrder(order))
  };
}

/**
 * All dispatched/delivered orders for History — dedicated status filter + updated_at sort.
 */
export async function listWarehouseHistoryOrders(input: {
  scope: WarehouseScope;
  defaultWarehouseCode: string;
  limit?: number;
  env?: EnvSource;
}) {
  const env = input.env ?? process.env;
  const limit = Math.min(Math.max(1, input.limit ?? WAREHOUSE_HISTORY_LIST_LIMIT), 500);
  const hotCutoff = encodeURIComponent(operationalArchiveHotCutoffIso());
  const warehouseFilter = warehouseScopeQueryFilter({
    isGlobal: input.scope.isGlobal,
    warehouseCode: input.scope.warehouseCode,
    defaultWarehouseCode: input.defaultWarehouseCode
  });
  const query =
    `select=${LEAN_ORDER_SELECT}`
    + `&created_at=gte.${hotCutoff}`
    + `&fulfillment_status=in.(${DISPATCHED_STATUSES})`
    + warehouseFilter
    + `&order=updated_at.desc&limit=${limit}`;

  const result = await fetchLeanOrders(query, env);
  const scoped = filterOrdersForWarehouseScope(
    result.rows as Array<Record<string, unknown>>,
    input.scope,
    input.defaultWarehouseCode
  );
  const shipments = await fetchShipmentsForOrders(
    scoped.map((order) => text(order.id)).filter(Boolean),
    env
  );
  const shipmentByOrder = new Map<string, JsonRecord>();
  for (const shipment of shipments) {
    const orderId = text(shipment.order_id);
    if (!orderId || shipmentByOrder.has(orderId)) continue;
    shipmentByOrder.set(orderId, shipment);
  }

  return {
    available: result.available,
    blockedReason: result.blockedReason,
    rows: scoped.map((order) => mapLeanOrder(order, shipmentByOrder.get(text(order.id))))
  };
}

export async function exportWarehouseDashboardCsv(input: {
  scope: WarehouseScope;
  defaultWarehouseCode: string;
  env?: EnvSource;
}) {
  const list = await listWarehouseDashboardOpenOrders({
    ...input,
    limit: WAREHOUSE_DASHBOARD_EXPORT_MAX_ROWS,
    env: input.env
  });

  const headersRow = [
    "order_number",
    "created_at",
    "customer_name",
    "customer_phone",
    "customer_email",
    "fulfillment_status",
    "payment_status",
    "total",
    "currency"
  ];
  const dataRows = list.rows.map((row) => [
    row.orderNumber,
    row.createdAt,
    row.customerName,
    row.customerPhone,
    row.customerEmail,
    row.fulfillmentStatus,
    row.paymentStatus,
    row.total,
    row.currency
  ]);

  const day = new Date().toISOString().slice(0, 10);
  return {
    available: list.available,
    blockedReason: list.blockedReason,
    csv: buildArchiveCsvDocument(headersRow, dataRows),
    fileName: `warehouse-today-${day}.csv`
  };
}

export function warehouseAssignedCodeFromOrder(
  order: Record<string, unknown>,
  defaultWarehouseCode: string
) {
  const metadata = orderMetadata(order);
  return text(metadata.assigned_warehouse_code, defaultWarehouseCode);
}
