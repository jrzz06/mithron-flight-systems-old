import type { CheckoutOrderInput, CheckoutOrderItemInput } from "@/services/orders";
import type { DeploymentRequestInput, StaffTaskInput } from "@/services/operations-actions";
import type { ManualOrderPaymentMethod, ManualOrderWorkflowInput } from "@/services/manual-order";
import { deriveProductSku } from "@/lib/product-sku";

type JsonRecord = Record<string, unknown>;
type StockStatus = "available" | "low_stock" | "out_of_stock";

export type ProductInventoryWorkflowInput = {
  productSlug: string;
  sku: string;
  variantId: string | null;
  stockStatus: StockStatus;
  quantity: number;
  reservedQuantity?: number;
  reorderThreshold?: number;
  warehouseCode: string;
  changeSummary: string;
};

export type SimpleInventoryUpdateInput = {
  productSlug: string;
  sku: string;
  variantId: string | null;
  warehouseCode: string;
  stockStatus: StockStatus;
  quantity: number;
  note: string | null;
  changeSummary: string;
};

export type OrderCreateWorkflowInput = {
  checkout: CheckoutOrderInput;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  currency: string;
  note: string | null;
  changeSummary: string;
};

export type OrderLifecycleUpdateInput = {
  orderId: string;
  status: string | null;
  paymentStatus: string | null;
  fulfillmentStatus: string | null;
  note: string | null;
  shipmentTracking: JsonRecord | null;
  changeSummary: string;
};

export type DeploymentRequestWorkflowInput = DeploymentRequestInput & {
  orderId: string | null;
  assignedTo: string | null;
  changeSummary: string;
};

export const DEPLOYMENT_REQUEST_STATUSES = [
  "pending",
  "triaged",
  "approved",
  "rejected",
  "scheduled",
  "deployed",
  "rolled_back",
  "blocked",
  "escalated",
  "completed",
  "cancelled"
] as const;

export type DeploymentRequestStatus = (typeof DEPLOYMENT_REQUEST_STATUSES)[number];

export type DeploymentRequestLifecycleUpdateInput = {
  requestId: string;
  status: DeploymentRequestStatus;
  assignedTo: string | null;
  payload: JsonRecord;
  note: string | null;
  changeSummary: string;
};

export const STAFF_TASK_STATUSES = ["open", "in_progress", "blocked", "done"] as const;

export type StaffTaskStatus = (typeof STAFF_TASK_STATUSES)[number];

export type StaffTaskWorkflowInput = StaffTaskInput & {
  status: StaffTaskStatus | null;
  changeSummary: string;
};

export type NotificationWorkflowInput = {
  recipientId: string | null;
  channel: string;
  title: string;
  body: string | null;
  priority: string;
  entityTable: string | null;
  entityId: string | null;
  payload: JsonRecord;
  changeSummary: string;
};

export const ORDER_FULFILLMENT_STATES = [
  "pending",
  "packing",
  "dispatched",
  "delivered",
  "returned",
  "cancelled"
] as const;

export type OrderFulfillmentState = (typeof ORDER_FULFILLMENT_STATES)[number];

const orderFulfillmentTransitions: Record<OrderFulfillmentState, OrderFulfillmentState[]> = {
  pending: ["packing", "cancelled"],
  packing: ["dispatched", "cancelled"],
  dispatched: ["delivered"],
  delivered: ["returned"],
  returned: [],
  cancelled: []
};

export type ProductInventoryLinkageRecords = {
  inventoryRecord: {
    product_slug: string;
    sku: string;
    variant_id: string | null;
    stock_status: StockStatus;
    quantity: number;
    reserved_quantity: number;
    reorder_threshold: number;
    updated_by: string | null;
    updated_at: string;
  };
  warehouseStockRecord: {
    warehouse_code: string;
    product_slug: string;
    sku: string;
    variant_id: string | null;
    available_quantity: number;
    committed_quantity: number;
    last_counted_at: string;
    updated_by: string | null;
    updated_at: string;
  };
  lowStock: boolean;
};

function readRequiredString(formData: FormData, key: string, label: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} ${key} is required.`);
  }
  return value.trim();
}

function readOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalInteger(formData: FormData, key: string, label: string) {
  const value = readOptionalString(formData, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return parsed;
}

function readOptionalBoolean(formData: FormData, key: string) {
  const raw = formData.get(key);
  if (raw === null || raw === undefined) return false;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
  }
  return false;
}

function readOptionalJsonObject(formData: FormData, key: string, label: string) {
  const value = readOptionalString(formData, key);
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} ${key} must be a JSON object.`);
    }
    return parsed as JsonRecord;
  } catch (error) {
    if (error instanceof Error && /must be a JSON object/.test(error.message)) {
      throw error;
    }
    throw new Error(`${label} ${key} must be valid JSON.`);
  }
}

function readOrderItems(formData: FormData, key: string): CheckoutOrderItemInput[] {
  const simpleProductSlug = readOptionalString(formData, "order_item_product_slug");
  if (simpleProductSlug) {
    const quantity = readOptionalInteger(formData, "order_item_quantity", "Order item quantity") ?? 1;
    return [{
      productSlug: simpleProductSlug,
      quantity,
      ...(readOptionalString(formData, "order_item_sku") ? { sku: readOptionalString(formData, "order_item_sku") } : {}),
      ...(readOptionalString(formData, "order_item_bundle_id") ? { bundleId: readOptionalString(formData, "order_item_bundle_id") } : {})
    }];
  }

  const value = readRequiredString(formData, key, "Order");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Order items must be valid JSON.");
  }

  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error("Order items must be a non-empty JSON array.");
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Order item ${index + 1} must be an object.`);
    }

    const record = item as Record<string, unknown>;
    const productSlug = typeof record.productSlug === "string" ? record.productSlug.trim() : "";
    const quantity = Number(record.quantity);
    const bundleId = typeof record.bundleId === "string" && record.bundleId.trim() ? record.bundleId.trim() : undefined;
    const sku = typeof record.sku === "string" && record.sku.trim() ? record.sku.trim() : undefined;

    if (!productSlug) {
      throw new Error(`Order item ${index + 1} is missing productSlug.`);
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new Error(`Order item ${index + 1} quantity must be between 1 and 99.`);
    }

    return {
      productSlug,
      quantity,
      ...(sku ? { sku } : {}),
      ...(bundleId ? { bundleId } : {})
    };
  });
}

function readShipmentTrackingFromSimpleFields(formData: FormData) {
  const trackingNumber = readOptionalString(formData, "tracking_number");
  const carrier = readOptionalString(formData, "carrier");
  const trackingUrl = readOptionalString(formData, "tracking_url");
  if (!trackingNumber && !carrier && !trackingUrl) return undefined;
  return {
    tracking_number: trackingNumber ?? null,
    carrier: carrier ?? null,
    tracking_url: trackingUrl ?? null
  };
}

function readRequiredEnum<T extends string>(formData: FormData, key: string, values: readonly T[], label: string) {
  const value = readRequiredString(formData, key, label);
  if (!values.includes(value as T)) {
    throw new Error(`${label} ${key} must be one of: ${values.join(", ")}.`);
  }
  return value as T;
}

function normalizeLegacyFulfillmentState(value: string | null | undefined): string {
  const normalized = normalizeOrderStatusForStock(value, "pending");
  if (normalized === "queued" || normalized === "draft") return "pending";
  if (normalized === "fulfilled" || normalized === "completed") return "delivered";
  return normalized;
}

export function assertOrderFulfillmentStatus(value: string | null | undefined, label = "Order lifecycle fulfillment_status"): OrderFulfillmentState {
  const normalized = normalizeLegacyFulfillmentState(value);
  if (!(ORDER_FULFILLMENT_STATES as readonly string[]).includes(normalized)) {
    throw new Error(`${label} must be one of: ${ORDER_FULFILLMENT_STATES.join(", ")}.`);
  }
  return normalized as OrderFulfillmentState;
}

export function assertOrderFulfillmentTransition(current: string | null | undefined, next: string | null | undefined) {
  const currentState = assertOrderFulfillmentStatus(current, "Current order fulfillment_status");
  const nextState = assertOrderFulfillmentStatus(next);

  if (currentState === nextState) {
    throw new Error(`Duplicate order fulfillment transition ${currentState} -> ${nextState}.`);
  }

  if (!orderFulfillmentTransitions[currentState].includes(nextState)) {
    throw new Error(`Invalid order fulfillment transition ${currentState} -> ${nextState}.`);
  }

  return nextState;
}

export function buildProductInventoryWorkflowFromFormData(formData: FormData): ProductInventoryWorkflowInput {
  const productSlug = readRequiredString(formData, "product_slug", "Inventory");
  const sku = deriveProductSku(productSlug);
  const warehouseCode = readRequiredString(formData, "warehouse_code", "Inventory");
  const quantity = readOptionalInteger(formData, "quantity", "Inventory quantity") ?? 0;
  const reservedQuantity = readOptionalInteger(formData, "reserved_quantity", "Reserved quantity") ?? 0;
  const reorderThreshold = readOptionalInteger(formData, "reorder_threshold", "Reorder threshold") ?? 0;
  const sellable = Math.max(0, quantity - reservedQuantity);
  let stockStatus: StockStatus =
    sellable <= 0
      ? "out_of_stock"
      : reorderThreshold > 0 && sellable <= reorderThreshold
        ? "low_stock"
        : "available";
  const requestedStatus = readOptionalString(formData, "stock_status");
  // Explicit out_of_stock only when sellable is already zero; otherwise keep derived status.
  if (requestedStatus === "out_of_stock" && sellable <= 0) {
    stockStatus = "out_of_stock";
  } else if (requestedStatus === "low_stock" && sellable > 0) {
    stockStatus = "low_stock";
  }
  const variantId = readOptionalString(formData, "variant_id") ?? null;
  const changeSummary = readOptionalString(formData, "change_summary") ?? `Update inventory for ${productSlug}:${sku}`;

  return {
    productSlug,
    sku,
    variantId,
    stockStatus,
    quantity,
    reservedQuantity,
    reorderThreshold,
    warehouseCode,
    changeSummary
  };
}

export function buildSimpleInventoryUpdateFromFormData(formData: FormData): SimpleInventoryUpdateInput {
  const productSlug = readRequiredString(formData, "product_slug", "Inventory");
  const sku = readRequiredString(formData, "sku", "Inventory");
  const quantity = readOptionalInteger(formData, "quantity", "Inventory quantity") ?? 0;
  const stockStatus: StockStatus = quantity > 0 ? "available" : "out_of_stock";
  const variantId = readOptionalString(formData, "variant_id") ?? null;
  const warehouseCode = readOptionalString(formData, "warehouse_code") ?? "";
  const note = readOptionalString(formData, "note") ?? null;
  const changeSummary = readOptionalString(formData, "change_summary") ?? `Update stock for ${productSlug}:${sku}`;

  return {
    productSlug,
    sku,
    variantId,
    warehouseCode,
    stockStatus,
    quantity,
    note,
    changeSummary
  };
}

function deriveInventoryStockStatus(input: ProductInventoryWorkflowInput): StockStatus {
  const reserved = Math.max(0, input.reservedQuantity ?? 0);
  const reorder = Math.max(0, input.reorderThreshold ?? 0);
  const sellable = Math.max(0, input.quantity - reserved);
  if (sellable <= 0) return "out_of_stock";
  if (reorder > 0 && sellable <= reorder) return "low_stock";
  return "available";
}

export function reconcileAdminInventoryQuantities(input: { quantity: number }) {
  return { quantity: Math.max(0, input.quantity) };
}

export function buildInventoryLinkageRecords(
  input: ProductInventoryWorkflowInput,
  options: { actorId: string | null; at: string }
): ProductInventoryLinkageRecords {
  const stockStatus = deriveInventoryStockStatus(input);
  const reservedQuantity = Math.max(0, input.reservedQuantity ?? 0);
  const reorderThreshold = Math.max(0, input.reorderThreshold ?? 0);
  const sellable = Math.max(0, input.quantity - reservedQuantity);

  return {
    inventoryRecord: {
      product_slug: input.productSlug,
      sku: input.sku,
      variant_id: input.variantId,
      stock_status: stockStatus,
      quantity: input.quantity,
      reserved_quantity: reservedQuantity,
      reorder_threshold: reorderThreshold,
      updated_by: options.actorId,
      updated_at: options.at
    },
    warehouseStockRecord: {
      warehouse_code: input.warehouseCode,
      product_slug: input.productSlug,
      sku: input.sku,
      variant_id: input.variantId,
      available_quantity: sellable,
      committed_quantity: 0,
      last_counted_at: options.at,
      updated_by: options.actorId,
      updated_at: options.at
    },
    lowStock: stockStatus === "out_of_stock" || stockStatus === "low_stock"
  };
}

function readOptionalNumber(formData: FormData, key: string) {
  const value = readOptionalString(formData, key);
  if (value === undefined) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative number.`);
  }
  return parsed;
}

function assertManualPaymentMethod(value: string | undefined): ManualOrderPaymentMethod {
  const allowed: ManualOrderPaymentMethod[] = ["pending_payment", "paid", "cod", "bank_transfer", "manual", "not_required"];
  if (value && allowed.includes(value as ManualOrderPaymentMethod)) {
    return value as ManualOrderPaymentMethod;
  }
  throw new Error("A valid payment method is required.");
}

export function buildManualOrderInputFromFormData(formData: FormData): ManualOrderWorkflowInput {
  const email = readRequiredString(formData, "customer_email", "Customer");
  const phone = readRequiredString(formData, "customer_phone", "Customer");
  const fullName = readOptionalString(formData, "customer_full_name") ?? "";
  const items = readOrderItems(formData, "order_items");

  return {
    email,
    phone,
    fullName,
    customerUserId: readOptionalString(formData, "customer_user_id") ?? null,
    createAccountIfMissing: readOptionalBoolean(formData, "create_customer"),
    shippingAddress: {
      label: readOptionalString(formData, "shipping_label") ?? "Shipping",
      line1: readRequiredString(formData, "shipping_line1", "Shipping"),
      line2: readOptionalString(formData, "shipping_line2") ?? null,
      city: readRequiredString(formData, "shipping_city", "Shipping"),
      region: readRequiredString(formData, "shipping_region", "Shipping"),
      postalCode: readRequiredString(formData, "shipping_postal_code", "Shipping"),
      country: readOptionalString(formData, "shipping_country") ?? "India",
      phone: readOptionalString(formData, "shipping_phone") ?? phone
    },
    billingSameAsShipping: readOptionalBoolean(formData, "billing_same_as_shipping"),
    billingAddress: readOptionalBoolean(formData, "billing_same_as_shipping")
      ? undefined
      : {
          label: readOptionalString(formData, "billing_label") ?? "Billing",
          line1: readRequiredString(formData, "billing_line1", "Billing"),
          line2: readOptionalString(formData, "billing_line2") ?? null,
          city: readRequiredString(formData, "billing_city", "Billing"),
          region: readRequiredString(formData, "billing_region", "Billing"),
          postalCode: readRequiredString(formData, "billing_postal_code", "Billing"),
          country: readOptionalString(formData, "billing_country") ?? "India",
          phone: readOptionalString(formData, "billing_phone") ?? phone
        },
    items,
    paymentMethod: assertManualPaymentMethod(readOptionalString(formData, "payment_method")),
    shippingAmount: readOptionalNumber(formData, "shipping_amount"),
    discountAmount: readOptionalNumber(formData, "discount_amount"),
    warehouseCode: readRequiredString(formData, "warehouse_code", "Warehouse"),
    region: readOptionalString(formData, "region") ?? null,
    missionProfile: readOptionalString(formData, "mission_profile") ?? null,
    customerNote: readOptionalString(formData, "customer_note") ?? null,
    internalNote: readOptionalString(formData, "internal_note") ?? readOptionalString(formData, "note") ?? null,
    idempotencyKey: readOptionalString(formData, "idempotency_key") ?? null,
    sendCustomerNotification: readOptionalBoolean(formData, "send_customer_notification") || !formData.has("send_customer_notification"),
    shippingAddressId: readOptionalString(formData, "shipping_address_id") ?? null
  };
}

export function buildOrderCreateWorkflowFromFormData(formData: FormData): OrderCreateWorkflowInput {
  const customerEmail = readRequiredString(formData, "customer_email", "Order");
  const lineItems = readOrderItems(formData, "order_items");
  const missionProfile = readOptionalString(formData, "mission_profile");
  const region = readOptionalString(formData, "region");
  const metadata = readOptionalJsonObject(formData, "metadata", "Order") ?? {
    source: "admin_order_form",
    customer_note: readOptionalString(formData, "customer_note") ?? null
  };
  const currency = readOptionalString(formData, "currency") ?? "INR";
  const status = readOptionalString(formData, "status") ?? "draft";
  const paymentStatus = readOptionalString(formData, "payment_status") ?? "not_required";
  const fulfillmentStatus = assertOrderFulfillmentStatus(readOptionalString(formData, "fulfillment_status") ?? "pending", "Order fulfillment_status");
  const note = readOptionalString(formData, "note") ?? null;
  const changeSummary = readOptionalString(formData, "change_summary") ?? `Create order draft for ${customerEmail}`;

  return {
    checkout: {
      customerEmail,
      region,
      missionProfile,
      items: lineItems,
      metadata
    },
    status,
    paymentStatus,
    fulfillmentStatus,
    currency,
    note,
    changeSummary
  };
}

export function buildOrderLifecycleUpdateFromFormData(formData: FormData): OrderLifecycleUpdateInput {
  const orderId = readRequiredString(formData, "order_id", "Order lifecycle");
  const status = readOptionalString(formData, "status") ?? null;
  const paymentStatus = readOptionalString(formData, "payment_status") ?? null;
  const rawFulfillmentStatus = readOptionalString(formData, "fulfillment_status") ?? null;
  const fulfillmentStatus = rawFulfillmentStatus ? assertOrderFulfillmentStatus(rawFulfillmentStatus) : null;
  const note = readOptionalString(formData, "note") ?? null;
  const shipmentTracking = readShipmentTrackingFromSimpleFields(formData) ?? readOptionalJsonObject(formData, "shipment_tracking", "Order lifecycle") ?? null;
  const changeSummary = readOptionalString(formData, "change_summary") ?? `Update order lifecycle ${orderId}`;

  return {
    orderId,
    status,
    paymentStatus,
    fulfillmentStatus,
    note,
    shipmentTracking,
    changeSummary
  };
}

export function buildDeploymentRequestWorkflowFromFormData(formData: FormData): DeploymentRequestWorkflowInput {
  const requesterEmail = readRequiredString(formData, "requester_email", "Deployment request");
  const region = readOptionalString(formData, "region");
  const missionProfile = readOptionalString(formData, "mission_profile");
  const notes = readOptionalString(formData, "notes");
  const priority = readRequiredEnum(formData, "priority", ["low", "normal", "high", "critical"] as const, "Deployment request");
  const payload = readOptionalJsonObject(formData, "payload", "Deployment request");
  const orderId = readOptionalString(formData, "order_id") ?? null;
  const assignedTo = readOptionalString(formData, "assigned_to") ?? null;
  const changeSummary = readOptionalString(formData, "change_summary") ?? `Create deployment request for ${requesterEmail}`;

  return {
    requesterEmail,
    region,
    missionProfile,
    notes,
    priority,
    payload,
    orderId,
    assignedTo,
    changeSummary
  };
}

export function buildDeploymentRequestLifecycleUpdateFromFormData(formData: FormData): DeploymentRequestLifecycleUpdateInput {
  const requestId = readRequiredString(formData, "request_id", "Deployment request lifecycle");
  const status = readRequiredEnum(
    formData,
    "status",
    DEPLOYMENT_REQUEST_STATUSES,
    "Deployment request lifecycle"
  );
  const assignedTo = readOptionalString(formData, "assigned_to") ?? null;
  const payload = readOptionalJsonObject(formData, "payload", "Deployment request lifecycle") ?? {};
  const note = readOptionalString(formData, "note") ?? null;
  const changeSummary = readOptionalString(formData, "change_summary") ?? `Update deployment request ${requestId} to ${status}`;

  return {
    requestId,
    status,
    assignedTo,
    payload,
    note,
    changeSummary
  };
}

export function buildStaffTaskWorkflowFromFormData(formData: FormData): StaffTaskWorkflowInput {
  const title = readRequiredString(formData, "title", "Staff task");
  const body = readOptionalString(formData, "body");
  const priority = readRequiredEnum(formData, "priority", ["low", "normal", "high", "critical"] as const, "Staff task");
  const assignedTo = readOptionalString(formData, "assigned_to");
  const relatedRequestId = readOptionalString(formData, "related_request_id");
  const dueAt = readOptionalString(formData, "due_at");
  const rawStatus = readOptionalString(formData, "status") ?? null;
  const status = rawStatus
    ? readRequiredEnum(formData, "status", STAFF_TASK_STATUSES, "Staff task")
    : null;
  const changeSummary = readOptionalString(formData, "change_summary") ?? `Create staff task ${title}`;

  return {
    title,
    body,
    priority,
    assignedTo,
    relatedRequestId,
    dueAt,
    status,
    changeSummary
  };
}

export function buildNotificationWorkflowFromFormData(formData: FormData): NotificationWorkflowInput {
  const title = readRequiredString(formData, "title", "Notification");
  const channel = readOptionalString(formData, "channel") ?? "admin";
  const body = readOptionalString(formData, "body") ?? null;
  const priority = readRequiredEnum(formData, "priority", ["low", "normal", "high", "critical"] as const, "Notification");
  const recipientId = readOptionalString(formData, "recipient_id") ?? null;
  const entityTable = readOptionalString(formData, "entity_table") ?? null;
  const entityId = readOptionalString(formData, "entity_id") ?? null;
  const payload = readOptionalJsonObject(formData, "payload", "Notification") ?? {};
  const changeSummary = readOptionalString(formData, "change_summary") ?? `Create notification ${title}`;

  return {
    recipientId,
    channel,
    title,
    body,
    priority,
    entityTable,
    entityId,
    payload,
    changeSummary
  };
}

export function buildOrderShippingAddressUpdateFromFormData(formData: FormData) {
  const orderId = readRequiredString(formData, "order_id", "Order");
  const billingSameAsShipping = formData.get("billing_same_as_shipping") === "on"
    || formData.get("billing_same_as_shipping") === "true"
    || readOptionalBoolean(formData, "billing_same_as_shipping")
    || !formData.has("billing_line1");

  const shippingState = readOptionalString(formData, "shipping_state")
    ?? readOptionalString(formData, "shipping_region");
  if (!shippingState) {
    throw new Error("Shipping state is required.");
  }

  const shipping = {
    line1: readRequiredString(formData, "shipping_line1", "Shipping"),
    line2: readOptionalString(formData, "shipping_line2") ?? null,
    city: readRequiredString(formData, "shipping_city", "Shipping"),
    state: shippingState,
    country: readOptionalString(formData, "shipping_country") ?? "India",
    postalCode: readRequiredString(formData, "shipping_postal_code", "Shipping"),
    phone: readOptionalString(formData, "shipping_phone") ?? null
  };

  let billing: typeof shipping | null = null;
  if (!billingSameAsShipping) {
    const billingState = readOptionalString(formData, "billing_state")
      ?? readOptionalString(formData, "billing_region");
    if (!billingState) {
      throw new Error("Billing state is required.");
    }
    billing = {
      line1: readRequiredString(formData, "billing_line1", "Billing"),
      line2: readOptionalString(formData, "billing_line2") ?? null,
      city: readRequiredString(formData, "billing_city", "Billing"),
      state: billingState,
      country: readOptionalString(formData, "billing_country") ?? "India",
      postalCode: readRequiredString(formData, "billing_postal_code", "Billing"),
      phone: readOptionalString(formData, "billing_phone") ?? null
    };
  }

  return {
    orderId,
    expectedUpdatedAt: readOptionalString(formData, "expected_updated_at") ?? null,
    billingSameAsShipping,
    shipping,
    billing
  };
}

export function buildAddOrderItemsFromFormData(formData: FormData) {
  const orderId = readRequiredString(formData, "order_id", "Order");
  const items = readOrderItems(formData, "order_items");
  return {
    orderId,
    expectedUpdatedAt: readOptionalString(formData, "expected_updated_at") ?? null,
    items: items.map((item) => ({
      productSlug: item.productSlug,
      quantity: item.quantity
    }))
  };
}

export function normalizeTimelineEventNote(value: string | null | undefined) {
  return value?.trim() ? value.trim() : null;
}

export function normalizeOrderStatusForStock(status: string | null | undefined, fallback = "draft") {
  return status?.trim() ? status.trim().toLowerCase() : fallback;
}

export function isOrderFulfillmentStateDone(value: string | null | undefined) {
  const normalized = normalizeOrderStatusForStock(value, "");
  return normalized === "fulfilled" || normalized === "completed" || normalized === "delivered";
}

export function clampNonNegativeInteger(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function parseBooleanFlag(formData: FormData, key: string) {
  return readOptionalBoolean(formData, key);
}
