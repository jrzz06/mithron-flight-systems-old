import { formatAddressInline, pickAddressFromMetadata } from "@/lib/addresses/format";

export type WarehouseOrderRow = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  orderDate: string;
  itemCount: number;
  priority: string;
  shippingMethod: string;
  paymentStatus: string;
  currentStep: string;
  assignedPicker: string;
  estimatedDispatch: string;
  fulfillmentStatus: string;
  orderStatus: string;
  paymentStatusRaw: string;
  warehouseCode: string;
  updatedAt: string;
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  not_required: "Not required",
  requires_payment: "Awaiting payment",
  processing: "Processing",
  succeeded: "Paid",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded"
};

export function paymentStatusLabel(status: string) {
  return PAYMENT_STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

export function orderMetadata(order: Record<string, unknown>) {
  const metadata = order.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** Prefer stored customer_full_name; fall back to legacy keys then email. */
export function warehouseCustomerName(order: Record<string, unknown>) {
  const metadata = orderMetadata(order);
  return (
    textValue(metadata.customer_full_name)
    || textValue(metadata.customer_name)
    || textValue(metadata.guest_name)
    || textValue(order.customer_email, "Guest")
  );
}

export function warehouseCustomerPhone(order: Record<string, unknown>) {
  const metadata = orderMetadata(order);
  return textValue(metadata.customer_phone) || textValue(order.customer_phone) || "—";
}

export function warehouseCustomerEmail(order: Record<string, unknown>) {
  return textValue(order.customer_email) || "—";
}

export function warehouseShippingAddress(order: Record<string, unknown>) {
  return formatGuestAddress(orderMetadata(order)) || "—";
}

export function buildWarehouseOrderRow(
  order: Record<string, unknown>,
  input: { itemCount: number; defaultWarehouseCode: string }
): WarehouseOrderRow {
  const orderId = String(order.id ?? "");
  const metadata = orderMetadata(order);
  const warehouseCode = textValue(metadata.assigned_warehouse_code, input.defaultWarehouseCode);
  return {
    orderId,
    orderNumber: String(order.order_number ?? orderId),
    customerName: warehouseCustomerName(order),
    customerEmail: warehouseCustomerEmail(order),
    customerPhone: warehouseCustomerPhone(order),
    shippingAddress: warehouseShippingAddress(order),
    orderDate: formatOrderDate(order.created_at),
    itemCount: input.itemCount,
    priority: orderPriority(order),
    shippingMethod: shippingMethod(order),
    paymentStatus: paymentStatusLabel(String(order.payment_status ?? "not_required")),
    currentStep: String(order.fulfillment_status ?? "pending"),
    assignedPicker: assignedPicker(order),
    estimatedDispatch: estimatedDispatchDate(order.created_at),
    fulfillmentStatus: String(order.fulfillment_status ?? "pending"),
    orderStatus: String(order.status ?? "assigned"),
    paymentStatusRaw: String(order.payment_status ?? "not_required"),
    warehouseCode,
    updatedAt: String(order.updated_at ?? "")
  };
}

export function orderPriority(order: Record<string, unknown>) {
  const metadata = orderMetadata(order);
  const priority = String(metadata.priority ?? "").trim();
  return priority || "Standard";
}

export function assignedPicker(order: Record<string, unknown>) {
  const metadata = orderMetadata(order);
  return String(metadata.assigned_to ?? metadata.assigned_employee ?? "").trim() || "Unassigned";
}

export function shippingMethod(order: Record<string, unknown>) {
  const metadata = orderMetadata(order);
  const fromMetadata = String(metadata.shipping_method ?? metadata.shippingMethod ?? "").trim();
  if (fromMetadata) return fromMetadata;
  const tracking = order.shipment_tracking;
  if (tracking && typeof tracking === "object" && !Array.isArray(tracking)) {
    const carrier = String((tracking as Record<string, unknown>).carrier ?? "").trim();
    if (carrier) return carrier;
  }
  return "Standard";
}

export function formatOrderDate(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function estimatedDispatchDate(createdAt: unknown) {
  const raw = typeof createdAt === "string" ? createdAt.trim() : "";
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  let added = 0;
  const result = new Date(date);
  while (added < 2) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(result);
}

export function formatGuestAddress(metadata: Record<string, unknown>) {
  return formatAddressInline(pickAddressFromMetadata(metadata, "shipping"));
}

function formatBillingAddress(metadata: Record<string, unknown>) {
  return formatAddressInline(pickAddressFromMetadata(metadata, "billing"));
}

export const ORDER_PROGRESS_STEPS = [
  { key: "pending", label: "Pending" },
  { key: "reserved", label: "Reserved" },
  { key: "processing", label: "Picking" },
  { key: "picked", label: "Packing" },
  { key: "packed", label: "Ready" },
  { key: "shipped", label: "Dispatched" }
] as const;

export function progressStepIndex(fulfillmentStatus: string) {
  if (fulfillmentStatus === "ready_to_dispatch") return 4;
  const index = ORDER_PROGRESS_STEPS.findIndex((step) => step.key === fulfillmentStatus);
  return index >= 0 ? index : 0;
}
