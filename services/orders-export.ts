import { formatAddressInline, pickAddressFromMetadata } from "@/lib/addresses/format";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { matchesAdminOrderQueue, type AdminOrderQueue } from "@/lib/orders/lifecycle";
import {
  assignedWarehouseCode,
  customerName,
  filterOrders,
  orderMetadata,
  orderPhone,
  parseOrderFiltersFromSearchParams,
  numberText,
  sortOrders,
  text,
  type AdminRow,
  type OrderFilterState
} from "@/components/admin/orders/order-view-helpers";
import {
  buildArchiveCsvDocument,
  operationalArchiveHotCutoffIso
} from "@/services/data-archive";

type JsonRecord = Record<string, unknown>;
type EnvSource = Record<string, string | undefined>;

export const ORDERS_EXPORT_MAX_ROWS = 10_000;

const ORDER_SELECT =
  "id,order_number,customer_email,status,payment_status,fulfillment_status,channel,subtotal,total,currency,metadata,shipment_tracking,invoice_url,archived_at,deleted_at,created_at,updated_at";

const ORDER_ITEM_SELECT =
  "id,order_id,product_slug,product_name,sku,quantity,line_total,metadata,created_at";

const SHIPMENT_SELECT =
  "id,shipment_number,shipment_status,order_id,warehouse_id,carrier_name,tracking_number,updated_at,created_at";

const INVOICE_SELECT = "order_id,invoice_number";

const ORDER_EXPORT_HEADERS = [
  "order_number",
  "order_date",
  "customer_name",
  "customer_email",
  "customer_phone",
  "products",
  "skus",
  "quantities",
  "warehouse",
  "order_status",
  "payment_status",
  "fulfillment_status",
  "shipment_status",
  "carrier",
  "tracking_number",
  "subtotal",
  "shipping_amount",
  "discount_amount",
  "total",
  "currency",
  "shipping_address",
  "invoice_number",
  "invoice_url",
  "created_at",
  "updated_at"
] as const;

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };
}

function resolveExportQueue(queue: string): AdminOrderQueue {
  const legacyMap: Record<string, AdminOrderQueue> = {
    review: "pending_verification",
    confirmed: "verified",
    fulfillment: "warehouse"
  };
  const normalized = legacyMap[queue] ?? queue;
  const allowed: AdminOrderQueue[] = [
    "active",
    "pending_verification",
    "verified",
    "warehouse",
    "completed",
    "cancelled",
    "archived",
    "trash",
    "all"
  ];
  return allowed.includes(normalized as AdminOrderQueue) ? normalized as AdminOrderQueue : "active";
}

function formatExportTimestamp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString();
}

function formatOrderDate(value: unknown) {
  const iso = formatExportTimestamp(value);
  return iso ? iso.slice(0, 10) : "";
}

function readMoneyMetadata(metadata: JsonRecord, key: string) {
  const value = Number(metadata[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function latestShipmentForOrder(orderId: string, shipments: AdminRow[]) {
  return shipments
    .filter((shipment) => text(shipment.order_id) === orderId)
    .sort((left, right) => text(right.updated_at).localeCompare(text(left.updated_at)))[0] ?? null;
}

function joinList(values: string[]) {
  return values.filter(Boolean).join("; ");
}

function shippingAddressForOrder(order: AdminRow) {
  const metadata = orderMetadata(order);
  const address = pickAddressFromMetadata(metadata, "shipping");
  return formatAddressInline(address);
}

function invoiceUrlForOrder(order: AdminRow) {
  const invoiceUrl = text(order.invoice_url);
  if (invoiceUrl) return invoiceUrl;
  const orderId = text(order.id);
  return orderId ? `/api/invoices/${orderId}` : "";
}

async function fetchPaginatedRows(
  table: string,
  select: string,
  extraQuery: string,
  env: EnvSource,
  maxRows = ORDERS_EXPORT_MAX_ROWS
): Promise<JsonRecord[]> {
  const config = assertSupabaseAdminConfig(env);
  const pageSize = 1000;
  const rows: JsonRecord[] = [];
  let offset = 0;

  while (rows.length < maxRows) {
    const limit = Math.min(pageSize, maxRows - rows.length);
    const response = await fetch(
      `${config.url}/rest/v1/${table}?select=${encodeURIComponent(select)}&${extraQuery}&order=created_at.desc&limit=${limit}&offset=${offset}`,
      { headers: headers(config.serviceRoleKey), cache: "no-store" }
    );
    if (!response.ok) break;
    const batch = (await response.json()) as JsonRecord[];
    if (!batch.length) break;
    rows.push(...batch);
    offset += batch.length;
    if (batch.length < limit) break;
  }

  return rows;
}

async function fetchOrderItemsForOrders(orderIds: string[], env: EnvSource) {
  if (!orderIds.length) return [] as AdminRow[];
  const config = assertSupabaseAdminConfig(env);
  const chunkSize = 80;
  const rows: AdminRow[] = [];

  for (let index = 0; index < orderIds.length; index += chunkSize) {
    const chunk = orderIds.slice(index, index + chunkSize);
    const filter = chunk.map((id) => encodeURIComponent(id)).join(",");
    const response = await fetch(
      `${config.url}/rest/v1/order_items?select=${encodeURIComponent(ORDER_ITEM_SELECT)}&order_id=in.(${filter})&order=created_at.asc&limit=5000`,
      { headers: headers(config.serviceRoleKey), cache: "no-store" }
    );
    if (!response.ok) continue;
    rows.push(...((await response.json()) as AdminRow[]));
  }

  return rows;
}

async function fetchShipmentsForOrders(orderIds: string[], env: EnvSource) {
  if (!orderIds.length) return [] as AdminRow[];
  const config = assertSupabaseAdminConfig(env);
  const chunkSize = 80;
  const rows: AdminRow[] = [];

  for (let index = 0; index < orderIds.length; index += chunkSize) {
    const chunk = orderIds.slice(index, index + chunkSize);
    const filter = chunk.map((id) => encodeURIComponent(id)).join(",");
    const response = await fetch(
      `${config.url}/rest/v1/shipments?select=${encodeURIComponent(SHIPMENT_SELECT)}&order_id=in.(${filter})&order=updated_at.desc&limit=5000`,
      { headers: headers(config.serviceRoleKey), cache: "no-store" }
    );
    if (!response.ok) continue;
    rows.push(...((await response.json()) as AdminRow[]));
  }

  return rows;
}

async function fetchInvoicesForOrders(orderIds: string[], env: EnvSource) {
  if (!orderIds.length) return new Map<string, string>();
  const config = assertSupabaseAdminConfig(env);
  const chunkSize = 80;
  const invoiceNumbers = new Map<string, string>();

  for (let index = 0; index < orderIds.length; index += chunkSize) {
    const chunk = orderIds.slice(index, index + chunkSize);
    const filter = chunk.map((id) => encodeURIComponent(id)).join(",");
    const response = await fetch(
      `${config.url}/rest/v1/invoices?select=${encodeURIComponent(INVOICE_SELECT)}&order_id=in.(${filter})&limit=5000`,
      { headers: headers(config.serviceRoleKey), cache: "no-store" }
    );
    if (!response.ok) continue;
    const rows = (await response.json()) as JsonRecord[];
    for (const row of rows) {
      const orderId = text(row.order_id);
      const invoiceNumber = text(row.invoice_number);
      if (orderId && invoiceNumber) invoiceNumbers.set(orderId, invoiceNumber);
    }
  }

  return invoiceNumbers;
}

function buildOrderExportRow(
  order: AdminRow,
  orderItems: AdminRow[],
  shipments: AdminRow[],
  invoiceNumbers: Map<string, string>,
  defaultWarehouseCode: string
) {
  const orderId = text(order.id);
  const items = orderItems.filter((item) => text(item.order_id) === orderId);
  const shipment = latestShipmentForOrder(orderId, shipments);
  const metadata = orderMetadata(order);
  const tracking = order.shipment_tracking;
  const trackingRecord =
    tracking && typeof tracking === "object" && !Array.isArray(tracking)
      ? (tracking as JsonRecord)
      : null;

  return [
    text(order.order_number) || orderId,
    formatOrderDate(order.created_at),
    customerName(order),
    text(order.customer_email),
    orderPhone(order),
    joinList(items.map((item) => text(item.product_name, text(item.product_slug, "Item")))),
    joinList(items.map((item) => text(item.sku))),
    joinList(items.map((item) => numberText(item.quantity))),
    assignedWarehouseCode(order, defaultWarehouseCode),
    text(order.status),
    text(order.payment_status),
    text(order.fulfillment_status, "pending"),
    text(shipment?.shipment_status),
    text(shipment?.carrier_name) || text(trackingRecord?.carrier),
    text(shipment?.tracking_number) || text(trackingRecord?.tracking_number),
    Number(order.subtotal ?? 0),
    readMoneyMetadata(metadata, "shipping_amount"),
    readMoneyMetadata(metadata, "discount_amount"),
    Number(order.total ?? 0),
    text(order.currency, "INR"),
    shippingAddressForOrder(order),
    invoiceNumbers.get(orderId) ?? "",
    invoiceUrlForOrder(order),
    formatExportTimestamp(order.created_at),
    formatExportTimestamp(order.updated_at)
  ];
}

export function buildOrdersExportCsv(
  orders: AdminRow[],
  orderItems: AdminRow[],
  shipments: AdminRow[],
  invoiceNumbers: Map<string, string>,
  defaultWarehouseCode: string
) {
  const rows = orders.map((order) =>
    buildOrderExportRow(order, orderItems, shipments, invoiceNumbers, defaultWarehouseCode)
  );
  return buildArchiveCsvDocument([...ORDER_EXPORT_HEADERS], rows);
}

export function ordersExportFileName(date = new Date()) {
  return `mithron-orders-${date.toISOString().slice(0, 10)}.csv`;
}

export type OrdersExportInput = {
  queue?: string;
  filters?: OrderFilterState;
  defaultWarehouseCode?: string;
  env?: EnvSource;
};

export async function exportOrdersCsv(input: OrdersExportInput = {}) {
  const env = input.env ?? process.env;
  const queue = resolveExportQueue(input.queue ?? "active");
  const filters = input.filters ?? {
    query: "",
    paymentStatus: "",
    fulfillmentStatus: "",
    warehouse: "",
    dateFrom: "",
    dateTo: "",
    customer: "",
    product: "",
    orderId: "",
    sort: "newest" as const
  };
  const defaultWarehouseCode = input.defaultWarehouseCode ?? "";

  const cutoff = operationalArchiveHotCutoffIso();
  const orders = await fetchPaginatedRows(
    "orders",
    ORDER_SELECT,
    `created_at=gte.${encodeURIComponent(cutoff)}`,
    env
  ) as AdminRow[];

  const orderIds = orders.map((order) => text(order.id)).filter(Boolean);
  const [orderItems, shipments, invoiceNumbers] = await Promise.all([
    fetchOrderItemsForOrders(orderIds, env),
    fetchShipmentsForOrders(orderIds, env),
    fetchInvoicesForOrders(orderIds, env)
  ]);

  const filtered = sortOrders(
    filterOrders(orders, orderItems, queue, filters, defaultWarehouseCode),
    filters.sort
  );

  return {
    csv: buildOrdersExportCsv(filtered, orderItems, shipments, invoiceNumbers, defaultWarehouseCode),
    fileName: ordersExportFileName(),
    rowCount: filtered.length
  };
}

export function parseOrdersExportSearchParams(searchParams: URLSearchParams): OrdersExportInput {
  const filters = parseOrderFiltersFromSearchParams(searchParams);
  return {
    queue: searchParams.get("queue") ?? "active",
    filters,
    defaultWarehouseCode: searchParams.get("default_warehouse") ?? ""
  };
}
