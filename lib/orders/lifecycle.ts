import type { OrderStatus, PaymentStatus } from "@/lib/orders/status";

export type EnterpriseOrderStage =
  | "draft"
  | "pending_verification"
  | "verified"
  | "ready_for_warehouse"
  | "picking"
  | "packed"
  | "dispatched"
  | "in_transit"
  | "delivered"
  | "cancelled"
  | "rejected"
  | "returned"
  | "archived"
  | "deleted";

export type AdminOrderQueue =
  | "active"
  | "pending_verification"
  | "verified"
  | "warehouse"
  | "completed"
  | "cancelled"
  | "archived"
  | "trash"
  | "all";

type OrderLike = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function isOrderDeleted(order: OrderLike) {
  return Boolean(order.deleted_at);
}

export function isOrderArchived(order: OrderLike) {
  return Boolean(order.archived_at);
}

export function resolveEnterpriseStage(order: OrderLike): EnterpriseOrderStage {
  if (isOrderDeleted(order)) return "deleted";
  if (isOrderArchived(order)) return "archived";

  const status = text(order.status) as OrderStatus;
  const fulfillment = text(order.fulfillment_status, "pending");

  if (status === "cancelled" || fulfillment === "cancelled") return "cancelled";
  if (status === "refunded" || fulfillment === "returned") return "returned";
  if (status === "draft") return "draft";
  if (status === "paid" || status === "admin_review" || status === "pending_payment") return "pending_verification";
  if (status === "confirmed") return "verified";
  if (status === "assigned") return "ready_for_warehouse";
  if (status === "processing" || fulfillment === "packing" || fulfillment === "processing" || fulfillment === "picked") {
    return "picking";
  }
  if (status === "packed" || fulfillment === "packed") return "packed";
  if (
    status === "dispatched"
    || fulfillment === "dispatched"
    || fulfillment === "ready_to_dispatch"
    || fulfillment === "shipped"
  ) {
    return status === "in_transit" ? "in_transit" : "dispatched";
  }
  if (status === "in_transit") return "in_transit";
  if (status === "delivered" || fulfillment === "delivered") return "delivered";
  return "pending_verification";
}

const ADMIN_WAREHOUSE_RELEASED_STATUSES = [
  "assigned",
  "processing",
  "packed",
  "dispatched",
  "in_transit",
  "delivered"
] as const;

export function isAdminWarehouseReleased(order: OrderLike) {
  return ADMIN_WAREHOUSE_RELEASED_STATUSES.includes(
    text(order.status) as (typeof ADMIN_WAREHOUSE_RELEASED_STATUSES)[number]
  );
}

export function isWarehouseEligible(order: OrderLike) {
  if (isOrderDeleted(order) || isOrderArchived(order)) return false;

  const status = text(order.status);
  const paymentStatus = text(order.payment_status);
  const paymentOk =
    isAdminWarehouseReleased(order)
    || paymentStatus === "succeeded"
    || paymentStatus === "not_required";
  const allowedStatus = ADMIN_WAREHOUSE_RELEASED_STATUSES.includes(
    status as (typeof ADMIN_WAREHOUSE_RELEASED_STATUSES)[number]
  );

  return paymentOk && allowedStatus;
}

export function matchesAdminOrderQueue(order: OrderLike, queue: AdminOrderQueue) {
  if (queue === "all") return true;
  if (queue === "trash") return isOrderDeleted(order);
  if (isOrderDeleted(order)) return false;

  const status = text(order.status);
  const fulfillment = text(order.fulfillment_status);
  const stage = resolveEnterpriseStage(order);

  if (queue === "archived") return isOrderArchived(order);
  if (isOrderArchived(order)) return false;

  if (queue === "pending_verification") {
    return ["paid", "admin_review", "pending_payment"].includes(status);
  }
  if (queue === "verified") return status === "confirmed";
  if (queue === "warehouse") {
    return status === "assigned"
      || ["packing", "processing", "picked", "packed", "ready_to_dispatch", "shipped", "dispatched"].includes(fulfillment);
  }
  if (queue === "completed") return status === "delivered" || fulfillment === "delivered";
  if (queue === "cancelled") return status === "cancelled" || status === "refunded";

  if (queue === "active") {
    return !["cancelled", "refunded", "delivered"].includes(status)
      && fulfillment !== "delivered"
      && stage !== "archived";
  }

  return true;
}

export const ENTERPRISE_STAGE_LABELS: Record<EnterpriseOrderStage, string> = {
  draft: "Order created",
  pending_verification: "Under review",
  verified: "Verified",
  ready_for_warehouse: "Picking",
  picking: "Picking",
  packed: "Picking",
  dispatched: "Dispatched",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rejected: "Rejected",
  returned: "Returned",
  archived: "Archived",
  deleted: "Deleted"
};

export const ADMIN_QUEUE_LABELS: Record<AdminOrderQueue, string> = {
  active: "Active",
  pending_verification: "Pending verification",
  verified: "Verified",
  warehouse: "Warehouse",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
  trash: "Trash",
  all: "All"
};

function paymentAllowsFulfillment(paymentStatus: unknown): paymentStatus is PaymentStatus {
  const value = text(paymentStatus);
  return value === "succeeded" || value === "not_required";
}

export type CustomerOrderSource = "enquiry" | "checkout" | "paid";

export type CustomerProgressStep = {
  label: string;
  state: "done" | "current" | "upcoming";
  completedAt: string | null;
};

export const CUSTOMER_ORDER_SOURCE_LABELS: Record<CustomerOrderSource, string> = {
  enquiry: "Enquiry Order",
  checkout: "Checkout Order",
  paid: "Paid Order"
};

const CONFIRMED_STATUSES = new Set([
  "confirmed",
  "assigned",
  "processing",
  "packed",
  "dispatched",
  "in_transit",
  "delivered"
]);

const DISPATCHED_STATUSES = new Set(["dispatched", "in_transit", "delivered"]);
const DISPATCHED_FULFILLMENT = new Set(["dispatched", "ready_to_dispatch", "shipped", "delivered"]);

function orderMetadata(order: OrderLike) {
  const metadata = order.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function readTimeline(order: OrderLike) {
  return Array.isArray(order.timeline) ? order.timeline as Array<Record<string, unknown>> : [];
}

function timelineTimestamp(order: OrderLike, matcher: (entry: Record<string, unknown>) => boolean) {
  const match = readTimeline(order).find(matcher);
  return match ? text(match.at) || null : null;
}

function isOrderConfirmed(order: OrderLike) {
  return CONFIRMED_STATUSES.has(text(order.status));
}

function isOrderDispatched(order: OrderLike) {
  const status = text(order.status);
  const fulfillment = text(order.fulfillment_status);
  return DISPATCHED_STATUSES.has(status) || DISPATCHED_FULFILLMENT.has(fulfillment);
}

function isOrderDelivered(order: OrderLike) {
  const status = text(order.status);
  const fulfillment = text(order.fulfillment_status);
  return status === "delivered" || fulfillment === "delivered";
}

function hasOnlinePayment(order: OrderLike, paymentProviderIntentId?: string | null) {
  if (paymentProviderIntentId?.trim()) return true;
  const metadata = orderMetadata(order);
  return Boolean(
    text(metadata.provider_intent_id)
    || text(metadata.payment_intent_id)
    || text(metadata.stripe_payment_intent_id)
  );
}

export function resolveCustomerSource(
  order: OrderLike,
  paymentProviderIntentId?: string | null
): CustomerOrderSource {
  const channel = text(order.channel);
  const metadata = orderMetadata(order);

  if (
    channel === "enquiry"
    || text(order.source_enquiry_id)
    || text(metadata.source_enquiry_id)
  ) {
    return "enquiry";
  }

  if (channel === "checkout" && hasOnlinePayment(order, paymentProviderIntentId)) {
    return "paid";
  }

  return "checkout";
}

export function customerOrderSourceLabel(
  order: OrderLike,
  paymentProviderIntentId?: string | null
) {
  return CUSTOMER_ORDER_SOURCE_LABELS[resolveCustomerSource(order, paymentProviderIntentId)];
}

function customerStepLabels(source: CustomerOrderSource) {
  switch (source) {
    case "enquiry":
      return ["Enquiry Submitted", "Received", "Picking", "Dispatched"] as const;
    case "paid":
      return ["Payment Confirmed", "Received", "Picking", "Dispatched"] as const;
    default:
      return ["Order Placed", "Received", "Picking", "Dispatched"] as const;
  }
}

const PICKING_FULFILLMENT = new Set(["packing", "processing", "picked", "packed"]);

function isInPicking(order: OrderLike) {
  return PICKING_FULFILLMENT.has(text(order.fulfillment_status));
}

function resolveCompletedThrough(order: OrderLike) {
  if (isOrderDelivered(order) || isOrderDispatched(order)) return 3;
  if (isInPicking(order)) return 2;
  if (isOrderConfirmed(order) || text(order.fulfillment_status) === "pending") return 1;
  return 0;
}

function resolveStepCompletedAt(
  order: OrderLike,
  index: number,
  enquiryCreatedAt?: string | null
) {
  if (index === 0) {
    return enquiryCreatedAt?.trim()
      || text(order.created_at)
      || null;
  }
  if (index === 1) {
    return timelineTimestamp(order, (entry) => CONFIRMED_STATUSES.has(text(entry.status)))
      || (isOrderConfirmed(order) || text(order.fulfillment_status) === "pending"
        ? text(order.updated_at) || null
        : null);
  }
  if (index === 2) {
    return timelineTimestamp(
      order,
      (entry) => PICKING_FULFILLMENT.has(text(entry.fulfillment_status))
        || text(entry.event).toLowerCase().includes("pack")
        || text(entry.event).toLowerCase().includes("pick")
    ) || (isInPicking(order) || isOrderDispatched(order) || isOrderDelivered(order)
      ? text(order.updated_at) || null
      : null);
  }
  return timelineTimestamp(
    order,
    (entry) => DISPATCHED_STATUSES.has(text(entry.status))
      || DISPATCHED_FULFILLMENT.has(text(entry.fulfillment_status))
      || text(entry.event).toLowerCase().includes("dispatch")
      || text(entry.status) === "delivered"
      || text(entry.fulfillment_status) === "delivered"
  ) || ((isOrderDispatched(order) || isOrderDelivered(order)) ? text(order.updated_at) || null : null);
}

export function buildCustomerProgressSteps(
  order: OrderLike,
  paymentProviderIntentId?: string | null,
  options?: { enquiryCreatedAt?: string | null }
): CustomerProgressStep[] {
  const source = resolveCustomerSource(order, paymentProviderIntentId);
  const labels: string[] = [...customerStepLabels(source)];
  if (isOrderDelivered(order)) {
    labels[labels.length - 1] = "Delivered";
  }
  const completedThrough = resolveCompletedThrough(order);
  const allDone = isOrderDelivered(order);

  return labels.map((label, index) => {
    let state: CustomerProgressStep["state"];
    if (allDone || index < completedThrough) {
      state = "done";
    } else if (index === completedThrough) {
      state = "current";
    } else {
      state = "upcoming";
    }

    return {
      label,
      state,
      completedAt: state === "upcoming"
        ? null
        : resolveStepCompletedAt(order, index, options?.enquiryCreatedAt)
    };
  });
}

export function currentCustomerProgressLabel(
  order: OrderLike,
  paymentProviderIntentId?: string | null,
  options?: { enquiryCreatedAt?: string | null }
) {
  const steps = buildCustomerProgressSteps(order, paymentProviderIntentId, options);
  return steps.find((step) => step.state === "current")?.label
    ?? steps.filter((step) => step.state === "done").at(-1)?.label
    ?? steps[0]?.label
    ?? "Order placed";
}
