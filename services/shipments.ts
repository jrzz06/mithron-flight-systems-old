import { assertSupabaseAdminConfig } from "@/lib/env";
import { isAdminWarehouseReleased } from "@/lib/orders/lifecycle";
import {
  createActivityLogRecord,
  createNotificationRecord,
  createShipmentItemRecord,
  createShipmentRecord,
  createShipmentTimelineRecord,
  recordEntityRevisionSnapshot,
  updateOrderRecord,
  updateShipmentRecord
} from "@/services/admin-actions";
import { appendOrderTimeline, buildOrderTimelineEntry } from "@/services/orders";
import { applyWarehouseStockMovement } from "@/services/warehouse-movements";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type EnvSource = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

const shipmentReadColumns = {
  orders: "select=id,status,payment_status,fulfillment_status,timeline",
  orderItems: "select=id,order_id,product_slug,sku,quantity,created_at",
  shipments: "select=id,order_id,shipment_number,shipment_status,warehouse_id,carrier_name,tracking_number,notes,created_at,updated_at",
  shipmentItems: "select=id,shipment_id,order_item_id,product_id,variant_id,quantity,created_at"
};

export const SHIPMENT_STATUSES = [
  "pending",
  "reserved",
  "packed",
  "ready_for_pickup",
  "shipped",
  "in_transit",
  "delivered",
  "failed",
  "returned",
  "damaged",
  "cancelled"
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export type ShipmentCreateItemInput = {
  orderItemId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
};

export type ShipmentCreateWorkflowInput = {
  orderId: string;
  warehouseId: string;
  carrierName: string | null;
  trackingNumber: string | null;
  notes: string | null;
  items: ShipmentCreateItemInput[];
  changeSummary: string;
  initialStatus?: ShipmentStatus;
};

export type ShipmentUpdateWorkflowInput = {
  shipmentId: string;
  shipmentStatus: ShipmentStatus;
  carrierName: string | null;
  trackingNumber: string | null;
  notes: string | null;
  changeSummary: string;
};

function adminHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

function readRequiredString(formData: FormData, key: string, label: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} ${key} is required.`);
  }
  return value.trim();
}

function readOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeRequired(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function normalizeOptional(value: string | null | undefined) {
  return value?.trim() ? value.trim() : null;
}

function normalizeTimestamp(value: string | Date) {
  const timestamp = value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    throw new Error("Shipment timeline timestamp is invalid.");
  }
  return timestamp;
}

function assertShipmentStatus(value: string) {
  if (!SHIPMENT_STATUSES.includes(value as ShipmentStatus)) {
    throw new Error(`Shipment status must be one of: ${SHIPMENT_STATUSES.join(", ")}.`);
  }
  return value as ShipmentStatus;
}

function readShipmentItems(formData: FormData) {
  const orderItemIds = formData.getAll("order_item_id")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  const productIds = formData.getAll("shipment_product_id")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  const quantities = formData.getAll("shipment_quantity")
    .map((value) => Number(typeof value === "string" ? value.trim() : value));

  if (orderItemIds.length) {
    if (productIds.length !== orderItemIds.length) {
      throw new Error("Shipment line items are missing product identifiers.");
    }
    return orderItemIds.map((orderItemId, index): ShipmentCreateItemInput => {
      const productId = productIds[index];
      const quantity = quantities[index];
      if (!productId) throw new Error(`Shipment item ${index + 1} is missing productId.`);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error(`Shipment item ${index + 1} quantity must be a positive integer.`);
      }
      return {
        orderItemId,
        productId,
        variantId: readOptionalString(formData, "variant_id"),
        quantity
      };
    });
  }

  const simpleOrderItemId = readOptionalString(formData, "order_item_id");
  const simpleProductId = readOptionalString(formData, "shipment_product_id") ?? readOptionalString(formData, "product_id");
  if (simpleOrderItemId || simpleProductId) {
    if (!simpleOrderItemId) throw new Error("Shipment order_item_id is required.");
    if (!simpleProductId) throw new Error("Shipment product slug is required.");
    const quantity = Number(readOptionalString(formData, "shipment_quantity") ?? "1");
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Shipment quantity must be a positive integer.");
    }
    return [{
      orderItemId: simpleOrderItemId,
      productId: simpleProductId,
      variantId: readOptionalString(formData, "variant_id"),
      quantity
    }];
  }

  const raw = readRequiredString(formData, "shipment_items", "Shipment");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Shipment items must be valid JSON.");
  }

  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error("Shipment items must be a non-empty JSON array.");
  }

  return parsed.map((item, index): ShipmentCreateItemInput => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Shipment item ${index + 1} must be an object.`);
    }
    const record = item as Record<string, unknown>;
    const orderItemId = typeof record.orderItemId === "string" ? record.orderItemId.trim() : "";
    const productId = typeof record.productId === "string" ? record.productId.trim() : "";
    const variantId = typeof record.variantId === "string" && record.variantId.trim() ? record.variantId.trim() : null;
    const quantity = Number(record.quantity);

    if (!orderItemId) throw new Error(`Shipment item ${index + 1} is missing orderItemId.`);
    if (!productId) throw new Error(`Shipment item ${index + 1} is missing productId.`);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`Shipment item ${index + 1} quantity must be a positive integer.`);
    }

    return { orderItemId, productId, variantId, quantity };
  });
}

async function fetchAdminRows<T extends JsonRecord>(table: string, query: string, env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(`${config.url}/rest/v1/${table}?${query}`, {
    headers: adminHeaders(config.serviceRoleKey),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${table}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T[];
}

async function fetchOrderRecord(orderId: string, env: EnvSource = process.env) {
  const rows = await fetchAdminRows<JsonRecord>(
    "orders",
    `id=eq.${encodeURIComponent(orderId)}&${shipmentReadColumns.orders}&limit=1`,
    env
  );
  if (!rows.length) {
    throw new Error(`Order ${orderId} was not found.`);
  }
  return rows[0];
}

async function fetchShipmentRecord(shipmentId: string, env: EnvSource = process.env) {
  const rows = await fetchAdminRows<JsonRecord>(
    "shipments",
    `id=eq.${encodeURIComponent(shipmentId)}&${shipmentReadColumns.shipments}&limit=1`,
    env
  );
  if (!rows.length) {
    throw new Error(`Shipment ${shipmentId} was not found.`);
  }
  return rows[0];
}

async function fetchOrderItems(orderId: string, env: EnvSource = process.env) {
  return fetchAdminRows<JsonRecord>(
    "order_items",
    `order_id=eq.${encodeURIComponent(orderId)}&${shipmentReadColumns.orderItems}&order=created_at.asc`,
    env
  );
}

export async function fetchShipmentOrderItems(orderId: string, env: EnvSource = process.env) {
  return fetchOrderItems(orderId, env);
}

export async function fetchShipmentItemsByOrderId(orderId: string, env: EnvSource = process.env) {
  const shipments = await fetchShipmentsByOrderId(orderId, env);
  return fetchShipmentItemsForShipments(shipments.map((shipment) => String(shipment.id ?? "")).filter(Boolean), env);
}

export async function fetchShipmentsByOrderId(orderId: string, env: EnvSource = process.env) {
  return fetchAdminRows<JsonRecord>(
    "shipments",
    `order_id=eq.${encodeURIComponent(orderId)}&${shipmentReadColumns.shipments}&order=created_at.asc`,
    env
  );
}

async function fetchShipmentItemsForShipments(shipmentIds: string[], env: EnvSource = process.env) {
  if (!shipmentIds.length) return [] as JsonRecord[];
  return fetchAdminRows<JsonRecord>(
    "shipment_items",
    `shipment_id=in.(${shipmentIds.map((id) => encodeURIComponent(id)).join(",")})&${shipmentReadColumns.shipmentItems}&order=created_at.asc`,
    env
  );
}

async function fetchShipmentItemsByShipmentId(shipmentId: string, env: EnvSource = process.env) {
  return fetchAdminRows<JsonRecord>(
    "shipment_items",
    `shipment_id=eq.${encodeURIComponent(shipmentId)}&${shipmentReadColumns.shipmentItems}&order=created_at.asc`,
    env
  );
}

function shipmentNumberFromTimestamp(timestamp: Date) {
  const y = timestamp.getUTCFullYear();
  const m = String(timestamp.getUTCMonth() + 1).padStart(2, "0");
  const d = String(timestamp.getUTCDate()).padStart(2, "0");
  const h = String(timestamp.getUTCHours()).padStart(2, "0");
  const min = String(timestamp.getUTCMinutes()).padStart(2, "0");
  const s = String(timestamp.getUTCSeconds()).padStart(2, "0");
  const ms = String(timestamp.getUTCMilliseconds()).padStart(3, "0");
  return `SHP-${y}${m}${d}-${h}${min}${s}${ms}`;
}

export function buildShipmentCreateWorkflowFromFormData(formData: FormData): ShipmentCreateWorkflowInput {
  const orderId = readRequiredString(formData, "order_id", "Shipment");
  const warehouseId = readRequiredString(formData, "warehouse_id", "Shipment");
  const carrierName = readOptionalString(formData, "carrier_name");
  const trackingNumber = readOptionalString(formData, "tracking_number");
  const notes = readOptionalString(formData, "notes");
  const changeSummary = readOptionalString(formData, "change_summary") ?? `Create shipment for order ${orderId}`;

  return {
    orderId,
    warehouseId,
    carrierName,
    trackingNumber,
    notes,
    items: readShipmentItems(formData),
    changeSummary
  };
}

export function buildShipmentUpdateWorkflowFromFormData(formData: FormData): ShipmentUpdateWorkflowInput {
  const shipmentId = readRequiredString(formData, "shipment_id", "Shipment update");
  const shipmentStatus = assertShipmentStatus(readRequiredString(formData, "shipment_status", "Shipment update"));

  return {
    shipmentId,
    shipmentStatus,
    carrierName: readOptionalString(formData, "carrier_name"),
    trackingNumber: readOptionalString(formData, "tracking_number"),
    notes: readOptionalString(formData, "notes"),
    changeSummary: readOptionalString(formData, "change_summary") ?? `Update shipment ${shipmentId} to ${shipmentStatus}`
  };
}

export function assertShipmentTransition(previousStatus: string | null | undefined, nextStatus: string) {
  const previous = assertShipmentStatus((previousStatus ?? "pending").trim());
  const next = assertShipmentStatus(nextStatus.trim());
  const allowed: Record<ShipmentStatus, ShipmentStatus[]> = {
    pending: ["reserved", "packed", "cancelled"],
    reserved: ["packed", "cancelled"],
    packed: ["ready_for_pickup", "shipped", "damaged", "cancelled"],
    ready_for_pickup: ["shipped", "damaged", "cancelled"],
    shipped: ["in_transit", "delivered", "failed", "returned", "damaged"],
    in_transit: ["delivered", "failed", "returned", "damaged"],
    delivered: ["returned"],
    failed: ["returned", "cancelled"],
    damaged: ["returned", "cancelled"],
    returned: [],
    cancelled: []
  };

  if (previous === next) return next;
  if (!allowed[previous].includes(next)) {
    throw new Error(`Invalid shipment transition ${previous} -> ${next}.`);
  }
  return next;
}

export function buildShipmentTimelineRecord(input: {
  shipmentId: string;
  eventType: string;
  previousStatus: string | null;
  nextStatus: ShipmentStatus;
  notes: string | null;
  actorUserId: string | null;
  at: string | Date;
}) {
  return {
    shipment_id: normalizeRequired(input.shipmentId, "Shipment timeline shipment_id"),
    event_type: normalizeRequired(input.eventType, "Shipment timeline event_type"),
    previous_status: normalizeOptional(input.previousStatus),
    next_status: assertShipmentStatus(input.nextStatus),
    notes: normalizeOptional(input.notes),
    actor_user_id: normalizeOptional(input.actorUserId),
    created_at: normalizeTimestamp(input.at)
  };
}

function rowId(row: JsonRecord) {
  return String(row.id ?? row.order_item_id ?? "");
}

function rowQuantity(row: JsonRecord) {
  const quantity = Number(row.quantity ?? 0);
  return Number.isFinite(quantity) ? Math.trunc(quantity) : 0;
}

export function validateShipmentItemsAgainstOrder(
  orderItems: JsonRecord[],
  existingShipmentItems: JsonRecord[],
  requestedItems: ShipmentCreateItemInput[]
) {
  const orderMap = new Map(orderItems.map((item) => [rowId(item), item]));
  const shippedByOrderItem = new Map<string, number>();
  for (const item of existingShipmentItems) {
    const orderItemId = String(item.order_item_id ?? "");
    shippedByOrderItem.set(orderItemId, (shippedByOrderItem.get(orderItemId) ?? 0) + rowQuantity(item));
  }

  for (const item of requestedItems) {
    const orderItem = orderMap.get(item.orderItemId);
    if (!orderItem) {
      throw new Error(`Shipment item ${item.orderItemId} is not part of the order.`);
    }
    const orderProduct = String(orderItem.product_slug ?? "");
    if (orderProduct !== item.productId) {
      throw new Error(`Shipment product ${item.productId} does not match order item ${item.orderItemId}.`);
    }
    const alreadyShipped = shippedByOrderItem.get(item.orderItemId) ?? 0;
    const remaining = rowQuantity(orderItem) - alreadyShipped;
    if (item.quantity > remaining) {
      throw new Error(`Shipment quantity exceeds remaining order quantity for item ${item.orderItemId}.`);
    }
    shippedByOrderItem.set(item.orderItemId, alreadyShipped + item.quantity);
  }

  return requestedItems;
}

export function deriveOrderFulfillmentStatusFromShipments(
  orderItems: JsonRecord[],
  shipmentItems: JsonRecord[],
  shipments: JsonRecord[]
) {
  if (!shipmentItems.length || !shipments.length) return "pending";
  const statuses = shipments.map((shipment) => String(shipment.shipment_status ?? ""));
  if (statuses.includes("returned")) return "returned";
  if (statuses.includes("damaged")) return "returned";
  if (statuses.includes("failed")) return "cancelled";

  const requiredQuantity = orderItems.reduce((sum, item) => sum + rowQuantity(item), 0);
  const shippedQuantity = shipmentItems.reduce((sum, item) => sum + rowQuantity(item), 0);
  if (shippedQuantity < requiredQuantity) return "processing";
  if (statuses.every((status) => status === "delivered")) return "delivered";
  if (statuses.some((status) => status === "in_transit" || status === "shipped")) return "shipped";
  if (statuses.some((status) => status === "ready_for_pickup")) return "ready_to_dispatch";
  return "packed";
}

const fulfillmentProgressRank: Record<string, number> = {
  pending: 0,
  processing: 1,
  picked: 2,
  packed: 3,
  ready_to_dispatch: 4,
  shipped: 5,
  delivered: 6,
  fulfilled: 6,
  cancelled: -1,
  returned: -1
};

function mergeFulfillmentStatus(currentStatus: string, derivedStatus: string) {
  const terminal = new Set(["cancelled", "returned", "delivered"]);
  if (terminal.has(derivedStatus)) return derivedStatus;
  const currentRank = fulfillmentProgressRank[currentStatus] ?? 0;
  const derivedRank = fulfillmentProgressRank[derivedStatus] ?? 0;
  return currentRank > derivedRank ? currentStatus : derivedStatus;
}

function timestampFieldsForStatus(status: ShipmentStatus, at: string) {
  if (status === "shipped") return { shipped_at: at };
  if (status === "delivered") return { delivered_at: at };
  if (status === "failed") return { failed_at: at };
  if (status === "returned") return { returned_at: at };
  if (status === "damaged") return { damaged_at: at };
  return {};
}

async function syncOrderFulfillmentFromShipments(order: JsonRecord, actorId: string | null, at: string, env: EnvSource) {
  const orderId = String(order.id ?? "");
  const [orderItems, shipments] = await Promise.all([
    fetchOrderItems(orderId, env),
    fetchShipmentsByOrderId(orderId, env)
  ]);
  const shipmentItems = await fetchShipmentItemsForShipments(shipments.map((shipment) => String(shipment.id ?? "")).filter(Boolean), env);
  const derivedStatus = deriveOrderFulfillmentStatusFromShipments(orderItems, shipmentItems, shipments);
  const currentStatus = String(order.fulfillment_status ?? "pending");
  const fulfillmentStatus = mergeFulfillmentStatus(currentStatus, derivedStatus);
  const timeline = appendOrderTimeline(
    order.timeline,
    buildOrderTimelineEntry({
      status: String(order.status ?? "active"),
      event: "shipment.fulfillment_sync",
      note: `Shipment workflow set fulfillment to ${fulfillmentStatus}.`,
      actorId,
      metadata: {
        fulfillment_status: fulfillmentStatus,
        shipment_count: shipments.length
      },
      at
    })
  );

  return updateOrderRecord(
    orderId,
    {
      fulfillment_status: fulfillmentStatus,
      timeline,
      updated_at: at
    },
    actorId,
    env
  );
}

async function emitShipmentEvents(input: {
  shipmentId: string;
  shipmentNumber: string;
  orderId: string;
  status: ShipmentStatus;
  action: string;
  notes: string | null;
  actorId: string | null;
  at: string;
  env: EnvSource;
}) {
  await createActivityLogRecord(
    {
      actor_id: input.actorId,
      action: input.action,
      entity_table: "shipments",
      entity_id: input.shipmentId,
      severity: input.status === "failed" || input.status === "returned" || input.status === "damaged" ? "warning" : "info",
      metadata: {
        shipment_number: input.shipmentNumber,
        shipment_status: input.status,
        order_id: input.orderId,
        notes: input.notes
      }
    },
    input.actorId,
    input.env
  );

  if (["pending", "reserved", "shipped", "delivered", "failed", "returned", "damaged"].includes(input.status)) {
    await createNotificationRecord(
      {
        channel: "warehouse",
        title: `Shipment ${input.status}: ${input.shipmentNumber}`,
        body: input.notes,
        status: "unread",
        priority: input.status === "failed" || input.status === "returned" || input.status === "damaged" ? "high" : "normal",
        entity_table: "shipments",
        entity_id: input.shipmentId,
        payload: {
          shipment_number: input.shipmentNumber,
          shipment_status: input.status,
          order_id: input.orderId
        }
      },
      input.actorId,
      input.env
    );
  }
}

export async function createShipmentWorkflow(input: ShipmentCreateWorkflowInput, options: {
  actorId: string | null;
  at: string | Date;
  env?: EnvSource;
}) {
  const env = options.env ?? process.env;
  const at = normalizeTimestamp(options.at);
  const order = await fetchOrderRecord(input.orderId, env);
  const paymentStatus = String(order.payment_status ?? "");
  const shippablePaymentStatuses = new Set(["succeeded", "not_required"]);
  if (!isAdminWarehouseReleased(order) && !shippablePaymentStatuses.has(paymentStatus)) {
    throw new Error(
      `Cannot create shipment for order ${input.orderId}: payment_status is "${paymentStatus}". Payment must succeed before fulfillment.`
    );
  }
  const orderItems = await fetchOrderItems(input.orderId, env);
  const existingShipments = await fetchShipmentsByOrderId(input.orderId, env);
  const existingShipmentItems = await fetchShipmentItemsForShipments(existingShipments.map((shipment) => String(shipment.id ?? "")).filter(Boolean), env);
  validateShipmentItemsAgainstOrder(orderItems, existingShipmentItems, input.items);

  const targetStatus = input.initialStatus ?? "pending";
  const shipment = await createShipmentRecord(
    {
      order_id: input.orderId,
      shipment_number: shipmentNumberFromTimestamp(new Date(at)),
      shipment_status: targetStatus,
      warehouse_id: input.warehouseId,
      carrier_name: input.carrierName,
      tracking_number: input.trackingNumber,
      notes: input.notes,
      actor_user_id: options.actorId,
      updated_at: at
    },
    options.actorId,
    env
  );
  const shipmentId = String((shipment as JsonRecord).id ?? "");
  const shipmentNumber = String((shipment as JsonRecord).shipment_number ?? "");
  if (!shipmentId) throw new Error("Shipment creation failed to return an id.");

  const orderItemMap = new Map(orderItems.map((item) => [String(item.id ?? ""), item]));
  const createdItems: JsonRecord[] = [];

  try {
    for (const item of input.items) {
      const orderItem = orderItemMap.get(item.orderItemId);
      if (!orderItem) throw new Error(`Order item ${item.orderItemId} was not found.`);
      const sku = normalizeOptional(String(orderItem.sku ?? ""));
      if (!sku) {
        throw new Error(`Cannot ship order item ${item.orderItemId}; SKU is required for inventory deduction.`);
      }

      const shipmentItem = await createShipmentItemRecord(
        {
          shipment_id: shipmentId,
          order_item_id: item.orderItemId,
          product_id: item.productId,
          variant_id: item.variantId,
          quantity: item.quantity
        },
        options.actorId,
        env
      );
      createdItems.push(shipmentItem);
    }

    const timeline = await createShipmentTimelineRecord(
      buildShipmentTimelineRecord({
        shipmentId,
        eventType: "shipment.created",
        previousStatus: null,
        nextStatus: targetStatus,
        notes: input.notes,
        actorUserId: options.actorId,
        at
      }),
      options.actorId,
      env
    );

    const updatedOrder = await syncOrderFulfillmentFromShipments(order, options.actorId, at, env);
    await emitShipmentEvents({
      shipmentId,
      shipmentNumber,
      orderId: input.orderId,
      status: targetStatus,
      action: "shipment.created",
      notes: input.notes,
      actorId: options.actorId,
      at,
      env
    });
    await recordEntityRevisionSnapshot("shipments", shipmentId, { shipment, items: createdItems, timeline }, options.actorId, input.changeSummary, env);

    return { shipment, items: createdItems, timeline, order: updatedOrder };
  } catch (error) {
    await cancelShipmentAndRestoreStock({
      shipmentId,
      shipmentNumber,
      shipment,
      orderId: input.orderId,
      orderItems,
      actorId: options.actorId,
      at,
      env
    });
    throw error;
  }
}

async function cancelShipmentAndRestoreStock(input: {
  shipmentId: string;
  shipmentNumber: string;
  shipment: JsonRecord;
  orderId: string;
  orderItems: JsonRecord[];
  actorId: string | null;
  at: string;
  env: EnvSource;
}) {
  try {
    await updateShipmentRecord(
      input.shipmentId,
      {
        shipment_status: "cancelled",
        notes: `Auto-cancelled after failed shipment workflow. ${String(input.shipment.notes ?? "")}`.trim(),
        updated_at: input.at
      },
      input.actorId,
      input.env
    );
  } catch {
    // Best-effort cancellation marker.
  }
}

async function restoreShipmentStock(input: {
  shipment: JsonRecord;
  shipmentItems: JsonRecord[];
  orderItems: JsonRecord[];
  status: ShipmentStatus;
  actorId: string | null;
  at: string;
  env: EnvSource;
}) {
  const orderItemMap = new Map(input.orderItems.map((item) => [String(item.id ?? ""), item]));
  for (const shipmentItem of input.shipmentItems) {
    const orderItem = orderItemMap.get(String(shipmentItem.order_item_id ?? ""));
    const sku = normalizeOptional(String(orderItem?.sku ?? ""));
    if (!orderItem || !sku) {
      throw new Error(`Cannot restore shipment item ${String(shipmentItem.id ?? "")}; order item SKU is missing.`);
    }
    await applyWarehouseStockMovement(
      {
        productSlug: String(shipmentItem.product_id ?? ""),
        sku,
        variantId: normalizeOptional(String(shipmentItem.variant_id ?? "")),
        warehouseCode: String(input.shipment.warehouse_id ?? ""),
        movementType: "return",
        quantityDelta: rowQuantity(shipmentItem),
        targetQuantity: null,
        reasonCode: `shipment_${input.status}`,
        notes: `Shipment ${String(input.shipment.shipment_number ?? input.shipment.id ?? "")} ${input.status}.`,
        relatedOrderId: String(input.shipment.order_id ?? ""),
        relatedShipmentId: String(input.shipment.id ?? ""),
        changeSummary: `Restore stock for shipment ${input.status}`
      },
      {
        actorId: input.actorId,
        at: input.at,
        env: input.env
      }
    );
  }
}

export async function updateShipmentWorkflow(input: ShipmentUpdateWorkflowInput, options: {
  actorId: string | null;
  at: string | Date;
  env?: EnvSource;
}) {
  const env = options.env ?? process.env;
  const at = normalizeTimestamp(options.at);
  const current = await fetchShipmentRecord(input.shipmentId, env);
  const previousStatus = assertShipmentStatus(String(current.shipment_status ?? "pending"));
  const nextStatus = assertShipmentTransition(previousStatus, input.shipmentStatus);

  if ((nextStatus === "returned" || nextStatus === "cancelled") && previousStatus !== "returned" && previousStatus !== "cancelled") {
    const [shipmentItems, orderItems] = await Promise.all([
      fetchShipmentItemsByShipmentId(input.shipmentId, env),
      fetchOrderItems(String(current.order_id ?? ""), env)
    ]);
    await restoreShipmentStock({
      shipment: current,
      shipmentItems,
      orderItems,
      status: nextStatus,
      actorId: options.actorId,
      at,
      env
    });
  }

  const updated = await updateShipmentRecord(
    input.shipmentId,
    {
      shipment_status: nextStatus,
      carrier_name: input.carrierName ?? current.carrier_name ?? null,
      tracking_number: input.trackingNumber ?? current.tracking_number ?? null,
      notes: input.notes ?? current.notes ?? null,
      actor_user_id: options.actorId,
      ...timestampFieldsForStatus(nextStatus, at),
      updated_at: at
    },
    options.actorId,
    env
  );

  const timeline = await createShipmentTimelineRecord(
    buildShipmentTimelineRecord({
      shipmentId: input.shipmentId,
      eventType: `shipment.${nextStatus}`,
      previousStatus,
      nextStatus,
      notes: input.notes,
      actorUserId: options.actorId,
      at
    }),
    options.actorId,
    env
  );

  const order = await fetchOrderRecord(String(current.order_id ?? ""), env);
  const updatedOrder = await syncOrderFulfillmentFromShipments(order, options.actorId, at, env);
  await emitShipmentEvents({
    shipmentId: input.shipmentId,
    shipmentNumber: String(current.shipment_number ?? input.shipmentId),
    orderId: String(current.order_id ?? ""),
    status: nextStatus,
    action: `shipment.${nextStatus}`,
    notes: input.notes,
    actorId: options.actorId,
    at,
    env
  });
  await recordEntityRevisionSnapshot("shipments", input.shipmentId, { shipment: updated, timeline }, options.actorId, input.changeSummary, env);

  return { shipment: updated, timeline, order: updatedOrder };
}
