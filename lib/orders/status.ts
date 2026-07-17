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
  "processing",
  "picked",
  "packed",
  "ready_to_dispatch",
  "shipped",
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
  processing: "Processing",
  picked: "Picked",
  packed: "Packed",
  ready_to_dispatch: "Ready to dispatch",
  shipped: "Shipped",
  delivered: "Delivered"
};
