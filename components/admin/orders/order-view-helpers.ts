import {
  formatMissingShippingAddressLabels,
  getMissingShippingAddressFields,
  isCompleteShippingAddressFields,
  resolveShippingAddressForCompleteness
} from "@/lib/addresses/format";
import { formatINR } from "@/lib/utils";
import {
  isOrderArchived,
  isOrderDeleted,
  matchesAdminOrderQueue
} from "@/lib/orders/lifecycle";
import { isCancellableOrderStatus } from "@/lib/orders/status";
import {
  LEAD_SOURCE_BADGE_CLASSES,
  LEAD_SOURCE_LABELS,
  normalizeLeadSource,
  type LeadSource
} from "@/lib/leads/shared";

export type AdminRow = Record<string, unknown>;

export type OrderSortKey =
  | "newest"
  | "oldest"
  | "total_desc"
  | "customer_asc"
  | "needs_action";

export type OrderFilterState = {
  query: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  warehouse: string;
  dateFrom: string;
  dateTo: string;
  customer: string;
  product: string;
  orderId: string;
  sort: OrderSortKey;
};

export const LIFECYCLE_STATES = [
  "pending",
  "packing",
  "dispatched",
  "delivered",
  "returned",
  "cancelled"
] as const;

const FULFILLMENT_NEXT_STEPS: Record<string, string[]> = {
  pending: ["packing"],
  packing: ["dispatched"],
  dispatched: ["delivered"],
  delivered: [],
  returned: [],
  cancelled: []
};

export function fulfillmentNextSteps(currentStatus: string) {
  return FULFILLMENT_NEXT_STEPS[currentStatus] ?? [];
}

export function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function numberText(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? String(parsed) : "0";
}

export function moneyText(value: unknown) {
  const parsed = Number(value ?? 0);
  return formatINR(Number.isFinite(parsed) ? parsed : 0);
}

export function publicOrderLabel(order: AdminRow) {
  return text(order.order_number) || text(order.id).slice(0, 8) || "Order";
}

/** Canonical URL/search key — full id when order_number is absent. */
export function orderSelectionKey(order: AdminRow) {
  return text(order.order_number) || text(order.id);
}

export function orderMatchesSelectionKey(order: AdminRow, key: string, orders?: AdminRow[]) {
  const normalizedKey = key.trim();
  if (!normalizedKey) return false;

  const orderNumber = text(order.order_number);
  const orderId = text(order.id);
  if (orderNumber && orderNumber === normalizedKey) return true;
  if (orderId && orderId === normalizedKey) return true;
  if (publicOrderLabel(order) === normalizedKey) {
    if (!orders?.length) return true;
    const labelMatches = orders.filter((row) => publicOrderLabel(row) === normalizedKey);
    return labelMatches.length === 1 && text(labelMatches[0]?.id) === orderId;
  }

  if (orderId && normalizedKey.length >= 8 && orderId.startsWith(normalizedKey)) {
    if (!orders?.length) return true;
    const matches = orders.filter((row) => text(row.id).startsWith(normalizedKey));
    return matches.length === 1 && text(matches[0]?.id) === orderId;
  }

  return false;
}

export function resolveOrderBySelectionKey(orders: AdminRow[], key: string) {
  const normalizedKey = key.trim();
  if (!normalizedKey) return null;

  const exact = orders.find(
    (order) => text(order.order_number) === normalizedKey || text(order.id) === normalizedKey
  );
  if (exact) return exact;

  const labelMatches = orders.filter((order) => publicOrderLabel(order) === normalizedKey);
  if (labelMatches.length === 1) return labelMatches[0];

  if (normalizedKey.length >= 8) {
    const prefixMatches = orders.filter((order) => text(order.id).startsWith(normalizedKey));
    if (prefixMatches.length === 1) return prefixMatches[0];
  }

  return null;
}

export function orderMetadata(order: AdminRow) {
  const metadata = order.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

export function orderPhone(order: AdminRow) {
  return text(orderMetadata(order).customer_phone);
}

export function customerName(order: AdminRow) {
  return text(orderMetadata(order).customer_full_name) || text(order.customer_email, "Guest");
}

export function assignedWarehouseCode(order: AdminRow, fallback: string) {
  return text(orderMetadata(order).assigned_warehouse_code, fallback);
}

export function orderDateTime(order: AdminRow) {
  const { date, time } = orderDateParts(order);
  if (date === "—") return "—";
  return time === "—" ? date : `${date} · ${time}`;
}

export function orderDateParts(order: AdminRow) {
  const raw = text(order.created_at) || text(order.updated_at);
  if (!raw) return { date: "—", time: "—" };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = raw.slice(0, 16).replace("T", " ");
    const [date = fallback, time = "—"] = fallback.split(" ");
    return { date, time };
  }
  return {
    date: parsed.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }),
    time: parsed.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit"
    })
  };
}

function orderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending_payment: "Awaiting payment",
    paid: "Paid",
    admin_review: "In review",
    confirmed: "Confirmed",
    assigned: "Assigned",
    processing: "Processing",
    cancelled: "Cancelled"
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

export function buildOrdersUrl(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/admin/orders?${query}` : "/admin/orders";
}

/** Primary UI tabs for Admin Orders (presentation layer only). */
export type AdminOrdersViewQueue =
  | "all"
  | "pending"
  | "processing"
  | "completed"
  | "cancelled";

export const ADMIN_ORDERS_VIEW_TABS: Array<{ key: AdminOrdersViewQueue; label: string }> = [
  { key: "all", label: "All Orders" },
  { key: "pending", label: "Pending" },
  { key: "processing", label: "Processing" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" }
];

const LEGACY_QUEUE_ALIASES: Record<string, string> = {
  review: "pending_verification",
  confirmed: "verified",
  fulfillment: "warehouse"
};

/**
 * Resolves URL `?queue=` into a canonical view-queue key for matching/filtering.
 * Legacy backend queue keys remain valid for bookmarks and deep links.
 */
export function resolveOrdersViewQueue(queue: string | undefined | null): string {
  const raw = (queue ?? "").trim() || "all";
  const normalized = LEGACY_QUEUE_ALIASES[raw] ?? raw;

  const allowed = new Set([
    "all",
    "pending",
    "processing",
    "completed",
    "cancelled",
    "active",
    "pending_verification",
    "verified",
    "warehouse"
  ]);

  return allowed.has(normalized) ? normalized : "all";
}

/** Maps any resolved queue (including legacy) to the primary tab highlight key. */
export function viewQueueTabKey(queue: string): AdminOrdersViewQueue {
  const resolved = resolveOrdersViewQueue(queue);
  switch (resolved) {
    case "pending":
    case "pending_verification":
      return "pending";
    case "processing":
    case "active":
    case "verified":
    case "warehouse":
      return "processing";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "all":
    default:
      return "all";
  }
}

/**
 * Composes existing `matchesAdminOrderQueue` matchers for simplified UI tabs.
 * Does not alter backend queue membership rules.
 */
export function orderMatchesViewQueue(order: AdminRow, queue: string) {
  const resolved = resolveOrdersViewQueue(queue);

  switch (resolved) {
    case "all":
      return matchesAdminOrderQueue(order, "all");
    case "pending":
    case "pending_verification":
      return matchesAdminOrderQueue(order, "pending_verification");
    case "processing":
      return (
        matchesAdminOrderQueue(order, "verified") ||
        matchesAdminOrderQueue(order, "warehouse") ||
        (matchesAdminOrderQueue(order, "active") &&
          !matchesAdminOrderQueue(order, "pending_verification"))
      );
    case "active":
      return matchesAdminOrderQueue(order, "active");
    case "verified":
      return matchesAdminOrderQueue(order, "verified");
    case "warehouse":
      return matchesAdminOrderQueue(order, "warehouse");
    case "completed":
      return matchesAdminOrderQueue(order, "completed");
    case "cancelled":
      return matchesAdminOrderQueue(order, "cancelled");
    default:
      return matchesAdminOrderQueue(order, "all");
  }
}

export function orderMatchesQueue(order: AdminRow, queue: string) {
  return orderMatchesViewQueue(order, queue);
}

export type PriorityBadge = "urgent" | "action" | "payment" | null;

export function orderPriorityBadge(order: AdminRow): PriorityBadge {
  const status = text(order.status);
  const channel = text(order.channel, "checkout");
  if (status === "pending_payment") return "payment";
  if (matchesAdminOrderQueue(order, "pending_verification")) return "action";
  if (channel === "enquiry" && ["paid", "admin_review"].includes(status)) return "urgent";
  return null;
}

export function orderNeedsAction(order: AdminRow) {
  return matchesAdminOrderQueue(order, "pending_verification");
}

export function orderItemsForOrder(orderId: string, orderItems: AdminRow[]) {
  return orderItems.filter((item) => text(item.order_id) === orderId);
}

export function productSummaryLine(orderId: string, orderItems: AdminRow[]) {
  const items = orderItemsForOrder(orderId, orderItems);
  if (!items.length) return { primary: "—", extra: 0 };
  const primary = items[0];
  const name = text(primary.product_name, text(primary.product_slug, "Item"));
  const qty = numberText(primary.quantity);
  return {
    primary: `${name} ×${qty}`,
    extra: Math.max(0, items.length - 1)
  };
}

export function resolveProductImage(products: AdminRow[], productSlug: string) {
  const product = products.find((row) => text(row.slug) === productSlug);
  if (!product) return null;
  const image = text(product.image) || text(product.hero);
  return image || null;
}

export function orderSearchHaystack(
  order: AdminRow,
  orderItems: AdminRow[]
) {
  const items = orderItemsForOrder(text(order.id), orderItems);
  const itemText = items
    .map((item) => `${text(item.product_name)} ${text(item.product_slug)} ${text(item.sku)}`)
    .join(" ");
  return [
    publicOrderLabel(order),
    text(order.id),
    text(order.customer_email),
    customerName(order),
    orderPhone(order),
    itemText
  ]
    .join(" ")
    .toLowerCase();
}

export function filterOrders(
  orders: AdminRow[],
  orderItems: AdminRow[],
  queue: string,
  filters: OrderFilterState,
  defaultWarehouse: string
) {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return orders.filter((order) => {
    if (!orderMatchesQueue(order, queue)) return false;

    if (normalizedQuery && !orderSearchHaystack(order, orderItems).includes(normalizedQuery)) {
      return false;
    }

    if (filters.paymentStatus && text(order.payment_status) !== filters.paymentStatus) return false;
    if (filters.fulfillmentStatus && text(order.fulfillment_status, "pending") !== filters.fulfillmentStatus) {
      return false;
    }
    if (filters.warehouse) {
      const wh = assignedWarehouseCode(order, defaultWarehouse);
      if (wh !== filters.warehouse) return false;
    }
    if (filters.customer) {
      const email = text(order.customer_email).toLowerCase();
      if (!email.includes(filters.customer.trim().toLowerCase())) return false;
    }
    if (filters.orderId) {
      const idHaystack = `${publicOrderLabel(order)} ${text(order.id)}`.toLowerCase();
      if (!idHaystack.includes(filters.orderId.trim().toLowerCase())) return false;
    }
    if (filters.product) {
      const slug = filters.product.trim().toLowerCase();
      const items = orderItemsForOrder(text(order.id), orderItems);
      const hasProduct = items.some(
        (item) =>
          text(item.product_slug).toLowerCase().includes(slug) ||
          text(item.product_name).toLowerCase().includes(slug)
      );
      if (!hasProduct) return false;
    }
    if (filters.dateFrom || filters.dateTo) {
      const created = text(order.created_at);
      if (created) {
        const day = created.slice(0, 10);
        if (filters.dateFrom && day < filters.dateFrom) return false;
        if (filters.dateTo && day > filters.dateTo) return false;
      }
    }

    return true;
  });
}

export function sortOrders(orders: AdminRow[], sort: OrderSortKey) {
  const copy = [...orders];
  copy.sort((a, b) => {
    switch (sort) {
      case "oldest":
        return text(a.created_at).localeCompare(text(b.created_at));
      case "total_desc":
        return Number(b.total ?? 0) - Number(a.total ?? 0);
      case "customer_asc":
        return customerName(a).localeCompare(customerName(b));
      case "needs_action": {
        const aAction = orderNeedsAction(a) ? 0 : 1;
        const bAction = orderNeedsAction(b) ? 0 : 1;
        if (aAction !== bAction) return aAction - bAction;
        return text(b.created_at).localeCompare(text(a.created_at));
      }
      case "newest":
      default:
        return text(b.created_at).localeCompare(text(a.created_at));
    }
  });
  return copy;
}

export function fullOrderTimeline(order: AdminRow) {
  if (!Array.isArray(order.timeline)) return [] as AdminRow[];
  return [...(order.timeline as AdminRow[])].reverse();
}

export function priorOrdersForCustomer(
  order: AdminRow,
  allOrders: AdminRow[],
  limit = 5
) {
  const email = text(order.customer_email).toLowerCase();
  if (!email) return [];
  const orderId = text(order.id);
  return allOrders
    .filter((row) => text(row.id) !== orderId && text(row.customer_email).toLowerCase() === email)
    .slice(0, limit);
}

export function nextStepForOrder(order: AdminRow) {
  const status = text(order.status, "pending");
  const fulfillment = text(order.fulfillment_status, "pending");
  const paymentStatus = text(order.payment_status, "pending");

  if (status === "paid") {
    return {
      title: "Verify order",
      description: "Payment is complete. Verify customer details, then move this order into admin review.",
      action: "confirm" as const,
      button: "Verify"
    };
  }
  if (status === "admin_review") {
    return {
      title: "Approve order",
      description: "Approve the order after verifying contact details, items, and any enquiry notes.",
      action: "confirm" as const,
      button: "Approve"
    };
  }
  if (status === "confirmed" && fulfillment === "pending") {
    return {
      title: "Send to warehouse",
      description: "Order is verified. Assign it to warehouse so picking and packing can begin.",
      action: "assign" as const,
      button: "Push to Warehouse"
    };
  }
  if (status === "assigned" || fulfillment === "processing") {
    return {
      title: "Track fulfillment",
      description: "Warehouse is working on this order. Update fulfillment status or create a shipment when ready.",
      action: "fulfillment" as const,
      button: ""
    };
  }
  if (status === "pending_payment") {
    return {
      title: "Awaiting customer payment",
      description:
        "Payment is still pending. If payment was collected outside the checkout gateway, use Mark as paid below. Otherwise, wait for payment or cancel from Danger Zone.",
      action: "none" as const,
      button: ""
    };
  }
  if (fulfillment === "returned" && paymentStatus !== "refunded") {
    return {
      title: "Resolve return",
      description: "Shipment has been marked as returned/damaged. Restock is already handled in the warehouse workflow. Next: refund and mark the order as refunded from Payment actions below.",
      action: "none" as const,
      button: ""
    };
  }
  return {
    title: "No action required",
    description: "This order is moving through fulfillment or already completed.",
    action: "none" as const,
    button: ""
  };
}

export {
  isOrderArchived,
  isOrderDeleted
} from "@/lib/orders/lifecycle";

export function canCancelOrder(order: AdminRow | null) {
  if (!order) return false;
  if (isHandedOffToWarehouse(order)) return false;
  const status = text(order.status, "pending");
  const fulfillment = text(order.fulfillment_status, "pending");
  const terminalFulfillment = ["cancelled", "delivered", "returned"];
  return isCancellableOrderStatus(status) && !terminalFulfillment.includes(fulfillment);
}

export function canPermanentlyDeleteOrder(order: AdminRow | null) {
  if (!order || isOrderDeleted(order)) return false;
  const status = text(order.status, "pending");
  const fulfillment = text(order.fulfillment_status, "pending");
  const channel = text(order.channel, "checkout");
  const activeFulfillment = ["packing", "dispatched", "delivered"];
  if (activeFulfillment.includes(fulfillment)) return false;
  if (["assigned", "processing", "packed", "dispatched", "delivered", "confirmed"].includes(status)) return false;
  return status === "cancelled" || channel === "enquiry";
}

/** True once warehouse owns the order (fulfillment left pending). */
export function isHandedOffToWarehouse(order: AdminRow | null) {
  if (!order) return false;
  const fulfillment = text(order.fulfillment_status, "pending");
  return fulfillment !== "" && fulfillment !== "pending";
}

/**
 * Incomplete pushed/test orders (₹0, no line items, or flagged needs_products/needs_address)
 * should not look like valid confirmed orders in the list.
 */
export function isIncompleteDraftOrder(order: AdminRow | null, hasItems?: boolean) {
  if (!order) return false;
  const metadata = orderMetadata(order);
  if (metadata.needs_products === true || metadata.needs_address === true) return true;
  if (hasItems === undefined) return false;
  const total = Number(order.total ?? 0);
  return Number.isFinite(total) && total <= 0 && !hasItems;
}

export type OrderSourceBadge = {
  label: string;
  className: string;
  source: LeadSource | "checkout";
};

/** Color-coded channel badge — mirrors Leads panel source badges when lead_source is present. */
export function orderSourceBadge(order: AdminRow | null): OrderSourceBadge {
  if (!order) {
    return {
      label: "Checkout",
      className: "border-zinc-500/40 bg-zinc-500/10 text-zinc-200",
      source: "checkout"
    };
  }
  const metadata = orderMetadata(order);
  const leadSourceRaw = metadata.lead_source;
  const channel = text(order.channel, "checkout");
  const hasLeadSource =
    typeof leadSourceRaw === "string" && leadSourceRaw.trim().length > 0;
  const fromLead =
    hasLeadSource || channel === "enquiry" || Boolean(text(order.source_lead_id));

  if (fromLead) {
    const source = normalizeLeadSource(leadSourceRaw ?? "contact_form");
    return {
      label: LEAD_SOURCE_LABELS[source],
      className: LEAD_SOURCE_BADGE_CLASSES[source],
      source
    };
  }

  return {
    label: "Checkout",
    className: "border-zinc-500/40 bg-zinc-500/10 text-zinc-200",
    source: "checkout"
  };
}

export function hasCompleteShippingAddress(order: AdminRow) {
  const metadata = orderMetadata(order);
  const address = resolveShippingAddressForCompleteness(metadata);
  if (!address) return metadata.needs_address === false;
  return isCompleteShippingAddressFields(address);
}

export function hasIdentifiedCustomer(order: AdminRow) {
  if (text(order.customer_email)) return true;
  if (text(order.customer_id)) return true;
  return Boolean(text(orderMetadata(order).customer_full_name));
}

export function fulfillmentReadinessMessage(order: AdminRow, hasItems: boolean) {
  const missing: string[] = [];
  if (!hasIdentifiedCustomer(order)) missing.push("customer details");
  if (!hasItems) missing.push("at least one product");

  if (!hasCompleteShippingAddress(order)) {
    const metadata = orderMetadata(order);
    const address = resolveShippingAddressForCompleteness(metadata);
    const fieldGaps = address ? getMissingShippingAddressFields(address) : [];
    if (address && fieldGaps.length) {
      return `Complete shipping address: ${formatMissingShippingAddressLabels(fieldGaps)}.`;
    }
    missing.push("a shipping address");
  }

  if (!missing.length) return null;
  if (missing.length === 1) return `Add ${missing[0]} before continuing.`;
  return `Add ${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]} before continuing.`;
}

export function parseOrderFiltersFromSearchParams(params: URLSearchParams): OrderFilterState {
  return {
    query: params.get("q") ?? "",
    paymentStatus: params.get("payment_status") ?? "",
    fulfillmentStatus: params.get("fulfillment_status") ?? "",
    warehouse: params.get("warehouse") ?? "",
    dateFrom: params.get("date_from") ?? "",
    dateTo: params.get("date_to") ?? "",
    customer: params.get("customer") ?? "",
    product: params.get("product") ?? "",
    orderId: params.get("order_id_filter") ?? "",
    sort: (params.get("sort") as OrderSortKey) || "newest"
  };
}

export function filtersToSearchParams(
  base: URLSearchParams,
  filters: OrderFilterState,
  extras: { queue?: string; order?: string; tool?: string }
) {
  const next = new URLSearchParams(base.toString());
  const setOrDelete = (key: string, value: string) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  setOrDelete("q", filters.query);
  setOrDelete("payment_status", filters.paymentStatus);
  setOrDelete("fulfillment_status", filters.fulfillmentStatus);
  setOrDelete("warehouse", filters.warehouse);
  setOrDelete("date_from", filters.dateFrom);
  setOrDelete("date_to", filters.dateTo);
  setOrDelete("customer", filters.customer);
  setOrDelete("product", filters.product);
  setOrDelete("order_id_filter", filters.orderId);
  if (filters.sort && filters.sort !== "newest") next.set("sort", filters.sort);
  else next.delete("sort");
  if (extras.queue) next.set("queue", extras.queue);
  else next.delete("queue");
  if (extras.order) next.set("order", extras.order);
  else next.delete("order");
  if (extras.tool) next.set("tool", extras.tool);
  else next.delete("tool");
  return next;
}
