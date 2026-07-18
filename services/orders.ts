type JsonRecord = Record<string, unknown>;

import { calculateProductTaxBreakdown } from "@/lib/product-tax";
import { roundInr, sumInr } from "@/lib/currency";

export type OrderCatalogProduct = {
  slug: string;
  name: string;
  price: number;
  category: string;
  chargeTax?: boolean;
  taxGroup?: string | null;
  taxRate?: number | null;
  taxIncluded?: boolean;
  compareAt?: number | null;
  onSale?: boolean;
  discountType?: string | null;
  discountValue?: number | null;
};

export type CheckoutOrderItemInput = {
  productSlug: string;
  quantity: number;
  bundleId?: string;
  sku?: string;
};

export type CheckoutOrderInput = {
  customerEmail: string;
  phone?: string;
  region?: string;
  missionProfile?: string;
  items: CheckoutOrderItemInput[];
  metadata?: JsonRecord;
};

export type ValidatedOrderDraft = {
  order: {
    customer_email: string;
    status: "draft";
    payment_status: "not_required";
    fulfillment_status: "pending";
    channel: "checkout";
    subtotal: number;
    total: number;
    currency: "INR";
    metadata: JsonRecord;
  };
  orderItems: Array<{
    product_slug: string;
    product_name: string;
    bundle_id: string | null;
    sku: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
    metadata: JsonRecord;
  }>;
};

export type OrderTimelineEntry = {
  at: string;
  event: string;
  status: string;
  note: string | null;
  actor_id: string | null;
  metadata: JsonRecord;
};

function assertEmail(value: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw new Error("A valid customerEmail is required to create an order draft.");
  }
}

function assertQuantity(value: number) {
  if (!Number.isInteger(value) || value <= 0 || value > 99) {
    throw new Error("Order item quantity must be an integer between 1 and 99.");
  }
}

export function buildValidatedOrderDraft(input: CheckoutOrderInput, catalogProducts: OrderCatalogProduct[]): ValidatedOrderDraft {
  assertEmail(input.customerEmail);
  if (!input.items.length) {
    throw new Error("At least one checkout item is required to create an order draft.");
  }

  const catalog = new Map(catalogProducts.map((product) => [product.slug, product]));
  const orderItems = input.items.map((item) => {
    assertQuantity(item.quantity);
    const product = catalog.get(item.productSlug);
    if (!product) {
      throw new Error(`Unknown product slug in checkout order: ${item.productSlug}.`);
    }
    const unitPrice = product.price;
    const taxBreakdown = calculateProductTaxBreakdown({
      unitPrice,
      quantity: item.quantity,
      chargeTax: product.chargeTax,
      taxGroup: product.taxGroup,
      taxRate: product.taxRate,
      taxIncluded: product.taxIncluded
    });
    return {
      product_slug: product.slug,
      product_name: product.name,
      bundle_id: item.bundleId ?? null,
      sku: item.sku?.trim() ? item.sku.trim() : null,
      quantity: item.quantity,
      unit_price: unitPrice,
      line_total: taxBreakdown.lineTotal,
      metadata: {
        category: product.category,
        charge_tax: taxBreakdown.chargeTax,
        tax_group: product.taxGroup ?? null,
        tax_rate: taxBreakdown.taxRate,
        tax_included: taxBreakdown.taxIncluded,
        taxable_base: taxBreakdown.taxableBase,
        tax_amount: taxBreakdown.taxAmount,
        list_price: product.compareAt ?? unitPrice,
        compare_at: product.compareAt ?? null,
        on_sale: Boolean(product.onSale),
        discount_type: product.discountType ?? null,
        discount_value: product.discountValue ?? null,
        pricing_snapshot_version: 1
      }
    };
  });
  const subtotal = roundInr(sumInr(orderItems.map((item) => Number(item.metadata.taxable_base ?? item.line_total))));
  const taxTotal = roundInr(sumInr(orderItems.map((item) => Number(item.metadata.tax_amount ?? 0))));
  const total = roundInr(sumInr(orderItems.map((item) => item.line_total)));

  return {
    order: {
      customer_email: input.customerEmail.trim(),
      status: "draft",
      payment_status: "not_required",
      fulfillment_status: "pending",
      channel: "checkout",
      subtotal,
      total,
      currency: "INR",
      metadata: {
        ...(input.metadata ?? {}),
        region: input.region ?? null,
        mission_profile: input.missionProfile ?? null,
        customer_phone: input.phone?.trim()
          || (typeof input.metadata?.customer_phone === "string" ? input.metadata.customer_phone.trim() : "")
          || null,
        payment_scope: "not_integrated",
        tax_total: taxTotal
      }
    },
    orderItems
  };
}

function isPlainRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function buildOrderTimelineEntry(input: {
  status: string;
  event: string;
  note?: string | null;
  actorId?: string | null;
  metadata?: JsonRecord;
  at?: string | Date;
}): OrderTimelineEntry {
  const status = input.status.trim();
  if (!status) {
    throw new Error("Order timeline status is required.");
  }

  const event = input.event.trim();
  if (!event) {
    throw new Error("Order timeline event is required.");
  }

  const at = input.at instanceof Date
    ? input.at.toISOString()
    : typeof input.at === "string" && input.at.trim()
      ? new Date(input.at).toISOString()
      : new Date().toISOString();

  if (!at || Number.isNaN(Date.parse(at))) {
    throw new Error("Order timeline timestamp is invalid.");
  }

  return {
    at,
    event,
    status,
    note: input.note?.trim() ? input.note.trim() : null,
    actor_id: input.actorId?.trim() ? input.actorId : null,
    metadata: input.metadata ?? {}
  };
}

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "admin_review"
  | "confirmed"
  | "assigned"
  | "processing"
  | "packed"
  | "dispatched"
  | "in_transit"
  | "delivered"
  | "refunded"
  | "cancelled"
  | "draft";

const orderStatusTransitions: Record<OrderStatus, OrderStatus[]> = {
  draft: ["pending_payment"],
  pending_payment: ["paid"],
  paid: ["admin_review", "refunded"],
  admin_review: ["confirmed", "cancelled"],
  confirmed: ["assigned"],
  assigned: ["processing"],
  processing: ["packed"],
  packed: ["dispatched"],
  dispatched: ["in_transit"],
  in_transit: ["delivered"],
  delivered: ["refunded"],
  refunded: [],
  cancelled: []
};

export function canTransitionOrderStatus(from: string, to: OrderStatus) {
  const allowed = orderStatusTransitions[from as OrderStatus];
  return Boolean(allowed?.includes(to));
}

export function transitionOrderStatus(currentStatus: string, nextStatus: OrderStatus) {
  if (!canTransitionOrderStatus(currentStatus, nextStatus)) {
    throw new Error(`Invalid order status transition from ${currentStatus} to ${nextStatus}.`);
  }
  return nextStatus;
}

import { assertCustomerContact } from "@/lib/api/customer-contact";

export function buildCustomerCheckoutDraft(
  input: CheckoutOrderInput,
  catalogProducts: OrderCatalogProduct[],
  userId?: string | null
) {
  if (!input.phone?.trim()) {
    throw new Error("A valid customer phone number is required.");
  }
  assertCustomerContact(input.customerEmail, input.phone);
  const draft = buildValidatedOrderDraft(input, catalogProducts);
  return {
    ...draft,
    order: {
      ...draft.order,
      status: "pending_payment" as const,
      payment_status: "requires_payment" as const,
      metadata: {
        ...draft.order.metadata,
        payment_scope: "gateway",
        created_by_user_id: userId ?? null,
        is_guest: !userId
      } satisfies JsonRecord
    }
  };
}

export function buildCustomerEnquiryOrderDraft(
  input: CheckoutOrderInput & { enquiryMessage: string },
  catalogProducts: OrderCatalogProduct[],
  userId?: string | null
) {
  if (!input.phone?.trim()) {
    throw new Error("A valid customer phone number is required.");
  }
  assertCustomerContact(input.customerEmail, input.phone);
  const draft = buildValidatedOrderDraft(input, catalogProducts);
  const timeline = [
    buildOrderTimelineEntry({
      status: "admin_review",
      event: "enquiry_submitted",
      note: input.enquiryMessage.slice(0, 500),
      actorId: userId ?? null
    })
  ];

  return {
    ...draft,
    order: {
      ...draft.order,
      status: "admin_review" as const,
      payment_status: "not_required" as const,
      channel: "enquiry" as const,
      timeline,
      metadata: {
        ...draft.order.metadata,
        payment_scope: "enquiry",
        enquiry_message: input.enquiryMessage,
        created_by_user_id: userId ?? null,
        is_guest: !userId
      } satisfies JsonRecord
    }
  };
}

export function appendOrderTimeline(currentTimeline: unknown, nextEntry: OrderTimelineEntry) {
  const timeline = Array.isArray(currentTimeline)
    ? currentTimeline.filter((entry) => isPlainRecord(entry))
    : [];
  return [...timeline, nextEntry];
}

const fulfillmentToOrderStatus: Partial<Record<string, OrderStatus>> = {
  packing: "processing",
  dispatched: "dispatched",
  delivered: "delivered"
};

const orderStatusRank: Record<OrderStatus, number> = {
  draft: 0,
  pending_payment: 1,
  paid: 2,
  admin_review: 3,
  confirmed: 4,
  assigned: 5,
  processing: 6,
  packed: 7,
  dispatched: 8,
  in_transit: 9,
  delivered: 10,
  refunded: 11,
  cancelled: 12
};

/** Keep procurement `orders.status` aligned with warehouse fulfillment transitions. */
export function syncOrderStatusFromFulfillment(currentOrderStatus: string, fulfillmentStatus: string) {
  const target = fulfillmentToOrderStatus[fulfillmentStatus];
  if (!target) return currentOrderStatus;

  const currentRank = orderStatusRank[currentOrderStatus as OrderStatus];
  const targetRank = orderStatusRank[target];
  if (Number.isFinite(currentRank) && targetRank <= currentRank) {
    return currentOrderStatus;
  }

  if (canTransitionOrderStatus(currentOrderStatus, target)) {
    return target;
  }

  return targetRank >= (Number.isFinite(currentRank) ? currentRank : 0) ? target : currentOrderStatus;
}

export function buildWarehouseAssignmentUpdate(
  currentOrderStatus: string,
  currentFulfillmentStatus: string
): { nextStatus: OrderStatus; nextFulfillment: string } {
  const orderStatus = currentOrderStatus || "confirmed";
  const fulfillmentStatus = currentFulfillmentStatus || "pending";

  if (orderStatus !== "confirmed") {
    throw new Error(`Order cannot be assigned to warehouse from status ${orderStatus}.`);
  }

  const nextFulfillment = fulfillmentStatus === "pending" ? "packing" : fulfillmentStatus;
  let nextStatus = transitionOrderStatus(orderStatus, "assigned");
  nextStatus = syncOrderStatusFromFulfillment(nextStatus, nextFulfillment) as OrderStatus;

  return { nextStatus, nextFulfillment };
}
