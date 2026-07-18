export const ORDER_STATUSES = [
  "draft",
  "pending_payment",
  "paid",
  "admin_review",
  "confirmed",
  "assigned",
  "processing",
  "packed",
  "dispatched",
  "in_transit",
  "delivered",
  "refunded",
  "cancelled"
] as const;

/** Statuses from which an admin may still cancel an order (anything before dispatch). */
export const CANCELLABLE_ORDER_STATUSES = [
  "draft",
  "pending_payment",
  "paid",
  "admin_review",
  "confirmed",
  "assigned",
  "processing",
  "packed"
] as const satisfies ReadonlyArray<(typeof ORDER_STATUSES)[number]>;

export type CancellableOrderStatus = (typeof CANCELLABLE_ORDER_STATUSES)[number];

export function isCancellableOrderStatus(status: string): status is CancellableOrderStatus {
  return (CANCELLABLE_ORDER_STATUSES as ReadonlyArray<string>).includes(status);
}

export const FULFILLMENT_STATUSES = [
  "pending",
  "packing",
  "dispatched",
  "delivered"
] as const;

export const PAYMENT_STATUSES = [
  "not_required",
  "requires_payment",
  "processing",
  "succeeded",
  "failed",
  "refunded"
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  pending: "Pending",
  packing: "Packing",
  dispatched: "Dispatched",
  delivered: "Delivered"
};

/** Extra fulfillment values that may still appear on legacy/terminal rows. */
const EXTRA_FULFILLMENT_LABELS: Record<string, string> = {
  returned: "Returned",
  cancelled: "Cancelled"
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  not_required: "Not required",
  requires_payment: "Requires payment",
  processing: "Processing",
  succeeded: "Paid",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  pending: "Pending"
};

export function fulfillmentStatusLabel(status: string): string {
  const normalized = status.toLowerCase().trim();
  if (normalized in FULFILLMENT_STATUS_LABELS) {
    return FULFILLMENT_STATUS_LABELS[normalized as FulfillmentStatus];
  }
  if (EXTRA_FULFILLMENT_LABELS[normalized]) return EXTRA_FULFILLMENT_LABELS[normalized];
  return status.replaceAll("_", " ") || "Pending";
}

export function paymentStatusLabel(status: string): string {
  const normalized = status.toLowerCase().trim();
  return PAYMENT_STATUS_LABELS[normalized] ?? (status.replaceAll("_", " ") || "Pending");
}

/** Filter options for admin orders — canonical fulfillment + terminal extras. */
export const FULFILLMENT_FILTER_STATUSES = [
  ...FULFILLMENT_STATUSES,
  "returned",
  "cancelled"
] as const;
