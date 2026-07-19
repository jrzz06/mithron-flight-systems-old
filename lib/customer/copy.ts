const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  pending: "Processing",
  pending_payment: "Pending Payment",
  paid: "Pending Payment",
  admin_review: "Pending Payment",
  confirmed: "Received",
  assigned: "Received",
  processing: "Picking",
  picked: "Picking",
  packed: "Picking",
  ready_to_dispatch: "Dispatched",
  shipped: "Dispatched",
  dispatched: "Dispatched",
  in_transit: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Cancelled",
  new: "Submitted",
  contacted: "We're in touch",
  qualified: "Under review",
  converted: "Received",
  lost: "Closed",
  won: "Completed",
  open: "Open",
  closed: "Closed",
  succeeded: "Paid",
  failed: "Payment failed",
  requires_payment: "Pending Payment",
  not_required: "No payment required",
  processing_payment: "Processing payment"
};

const CUSTOMER_FULFILLMENT_LABELS: Record<string, string> = {
  pending: "Received",
  packing: "Picking",
  processing: "Picking",
  picked: "Picking",
  packed: "Picking",
  ready_to_dispatch: "Dispatched",
  shipped: "Dispatched",
  dispatched: "Dispatched",
  delivered: "Delivered"
};

export const CUSTOMER_EMPTY_MESSAGES = {
  orders: "You haven't placed any orders yet.",
  enquiries: "You haven't submitted any enquiries yet.",
  addresses: "You haven't saved any addresses yet.",
  notifications: "You're all caught up. We'll let you know when something needs your attention."
} as const;

export const CUSTOMER_ORDER_POLICY = {
  cancellationUnavailable: "Order cancellation is not available. If an order cannot be fulfilled, our team will contact you with next steps."
} as const;

export function customerOrderStatus(status: string): string {
  const normalized = status.toLowerCase().trim();
  if (CUSTOMER_STATUS_LABELS[normalized] !== undefined) return CUSTOMER_STATUS_LABELS[normalized];
  return normalized.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function customerFulfillmentStatus(status: string): string {
  const normalized = status.toLowerCase().trim();
  if (CUSTOMER_FULFILLMENT_LABELS[normalized] !== undefined) return CUSTOMER_FULFILLMENT_LABELS[normalized];
  return customerOrderStatus(status);
}

export function customerEnquiryStatus(status: string): string {
  const normalized = status.toLowerCase().trim();
  if (normalized === "converted") return "Converted to order";
  return customerOrderStatus(status);
}

export function customerPaymentStatus(status: string): string {
  return customerOrderStatus(status);
}
