import { assertSupabaseAdminConfig } from "@/lib/env";
import { generateCustomerOrderNumber } from "@/lib/orders/order-number";
import {
  createActivityLogRecord,
  createAdminRecord,
  createOrderItemRecord,
  createOrderRecord,
  recordEntityRevisionSnapshot,
  updateAdminRecord
} from "@/services/admin-actions";
import { getCheckoutPricingBySlugs } from "@/services/catalog";
import { resolveCheckoutStockSkus } from "@/services/checkout-stock";
import { resolveManualOrderCustomer } from "@/services/customer-provisioning";
import {
  appendOrderTimeline,
  buildOrderTimelineEntry,
  buildValidatedOrderDraft,
  type CheckoutOrderItemInput
} from "@/services/orders";
import { notifyCustomerAboutOrder } from "@/services/order-workflow";

type EnvSource = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

export type ManualOrderPaymentMethod =
  | "pending_payment"
  | "paid"
  | "cod"
  | "bank_transfer"
  | "manual"
  | "not_required";

export type ManualOrderAddressInput = {
  label?: string;
  line1: string;
  line2?: string | null;
  city: string;
  region: string;
  postalCode: string;
  country?: string;
  phone?: string | null;
};

export type ManualOrderWorkflowInput = {
  email: string;
  phone: string;
  fullName: string;
  customerUserId?: string | null;
  createAccountIfMissing: boolean;
  shippingAddress: ManualOrderAddressInput;
  billingAddress?: ManualOrderAddressInput | null;
  billingSameAsShipping?: boolean;
  items: CheckoutOrderItemInput[];
  paymentMethod: ManualOrderPaymentMethod;
  shippingAmount?: number;
  discountAmount?: number;
  warehouseCode: string;
  region?: string | null;
  missionProfile?: string | null;
  customerNote?: string | null;
  internalNote?: string | null;
  idempotencyKey?: string | null;
  sendCustomerNotification?: boolean;
  shippingAddressId?: string | null;
};

export type ManualOrderWorkflowResult = {
  orderId: string;
  orderNumber: string;
  customerUserId: string | null;
  total: number;
  status: string;
  paymentStatus: string;
};

export type PersistOrderDraftOptions = {
  actorId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  currency: string;
  channel: string;
  createdByUserId: string | null;
  createdByStaffId?: string | null;
  metadata: JsonRecord;
  timelineNote: string | null;
  timelineSource: string;
  warehouseCode: string;
  changeSummary: string;
  env?: EnvSource;
};

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };
}

export function mapPaymentMethodToStatus(method: ManualOrderPaymentMethod): {
  status: string;
  paymentStatus: string;
  paymentProvider: string | null;
  recordPayment: boolean;
} {
  switch (method) {
    case "pending_payment":
      return { status: "pending_payment", paymentStatus: "requires_payment", paymentProvider: null, recordPayment: false };
    case "paid":
      return { status: "confirmed", paymentStatus: "succeeded", paymentProvider: "manual", recordPayment: true };
    case "cod":
      return { status: "confirmed", paymentStatus: "requires_payment", paymentProvider: "cod", recordPayment: false };
    case "bank_transfer":
      return { status: "confirmed", paymentStatus: "succeeded", paymentProvider: "bank_transfer", recordPayment: true };
    case "manual":
      return { status: "confirmed", paymentStatus: "succeeded", paymentProvider: "manual", recordPayment: true };
    case "not_required":
    default:
      return { status: "confirmed", paymentStatus: "not_required", paymentProvider: null, recordPayment: false };
  }
}

export function dedupeManualOrderItems(items: CheckoutOrderItemInput[]): CheckoutOrderItemInput[] {
  const map = new Map<string, CheckoutOrderItemInput>();
  for (const item of items) {
    const key = `${item.productSlug}::${item.sku ?? ""}`;
    if (map.has(key)) {
      throw new Error(`Duplicate product in order: ${item.productSlug}${item.sku ? ` (${item.sku})` : ""}.`);
    }
    map.set(key, item);
  }
  return [...map.values()];
}

function addressToMetadata(address: ManualOrderAddressInput) {
  return {
    label: address.label ?? "Shipping",
    line1: address.line1,
    line2: address.line2 ?? null,
    city: address.city,
    region: address.region,
    postal_code: address.postalCode,
    country: address.country ?? "India",
    phone: address.phone ?? null
  };
}

async function findManualOrderByIdempotencyKey(
  idempotencyKey: string,
  email: string,
  env: EnvSource = process.env
): Promise<ManualOrderWorkflowResult | null> {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(
    `${config.url}/rest/v1/orders?select=id,order_number,status,payment_status,total,created_by_user_id,customer_email&customer_email=eq.${encodeURIComponent(email.trim().toLowerCase())}&metadata->>idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as JsonRecord[];
  const order = rows[0];
  if (!order?.id) return null;
  return {
    orderId: String(order.id),
    orderNumber: String(order.order_number ?? order.id),
    customerUserId: typeof order.created_by_user_id === "string" ? order.created_by_user_id : null,
    total: Number(order.total ?? 0),
    status: String(order.status ?? ""),
    paymentStatus: String(order.payment_status ?? "")
  };
}

export async function cancelManualOrder(orderId: string, actorId: string, reason: string, env: EnvSource = process.env) {
  await updateAdminRecord(
    "orders",
    "id",
    orderId,
    {
      status: "cancelled",
      fulfillment_status: "cancelled",
      metadata: { cancellation_reason: reason },
      updated_at: new Date().toISOString()
    },
    actorId,
    env
  );
}

export async function persistValidatedOrderDraft(
  draft: Awaited<ReturnType<typeof buildValidatedOrderDraft>>,
  options: PersistOrderDraftOptions
): Promise<{ orderId: string; orderRecord: JsonRecord }> {
  const env = options.env ?? process.env;
  const now = new Date();
  const timeline = appendOrderTimeline(
    [],
    buildOrderTimelineEntry({
      status: options.status,
      event: "order.created",
      note: options.timelineNote,
      actorId: options.actorId,
      metadata: {
        source: options.timelineSource,
        item_count: draft.orderItems.length
      },
      at: now
    })
  );

  const mergedMetadata = {
    ...draft.order.metadata,
    ...options.metadata
  } as JsonRecord;

  const orderRecord = await createOrderRecord(
    {
      order_number: options.orderNumber,
      customer_email: draft.order.customer_email,
      status: options.status,
      payment_status: options.paymentStatus,
      fulfillment_status: options.fulfillmentStatus,
      channel: options.channel,
      subtotal: draft.order.subtotal,
      total: draft.order.total,
      currency: options.currency,
      timeline,
      metadata: mergedMetadata,
      created_by_user_id: options.createdByUserId,
      ...(options.createdByStaffId ? { created_by: options.createdByStaffId } : {}),
      ...(typeof mergedMetadata.shipping_address_id === "string"
        ? { shipping_address_id: mergedMetadata.shipping_address_id }
        : {}),
      ...(typeof mergedMetadata.billing_address_id === "string"
        ? { billing_address_id: mergedMetadata.billing_address_id }
        : {}),
      updated_at: now.toISOString()
    },
    options.actorId,
    env
  );

  const orderId = String(orderRecord.id ?? "");
  if (!orderId) throw new Error("Order creation failed to return an id.");

  try {
    for (const item of draft.orderItems) {
      await createOrderItemRecord(
        {
          order_id: orderId,
          product_slug: item.product_slug,
          product_name: item.product_name,
          bundle_id: item.bundle_id,
          sku: item.sku,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
          metadata: item.metadata,
          updated_at: now.toISOString()
        },
        options.actorId,
        env
      );
    }

  } catch (error) {
    await cancelManualOrder(orderId, options.actorId, "manual_order_persist_failed", env);
    throw error;
  }

  await createActivityLogRecord(
    {
      actor_id: options.actorId,
      action: "orders.create",
      entity_table: "orders",
      entity_id: orderId,
      severity: "info",
      metadata: {
        status: options.status,
        payment_status: options.paymentStatus,
        customer_email: draft.order.customer_email,
        item_count: draft.orderItems.length,
        total: draft.order.total,
        warehouse_code: options.warehouseCode,
        source: options.timelineSource
      }
    },
    options.actorId,
    env
  );

  await recordEntityRevisionSnapshot("orders", orderId, orderRecord as JsonRecord, options.actorId, options.changeSummary, env);

  return { orderId, orderRecord };
}

export async function createAdminManualOrderWorkflow(
  input: ManualOrderWorkflowInput,
  actorId: string,
  env: EnvSource = process.env
): Promise<ManualOrderWorkflowResult> {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  if (!email) throw new Error("Customer email is required.");
  if (!phone) throw new Error("Customer phone number is required.");
  if (!input.shippingAddress.line1.trim()) throw new Error("Shipping address is required.");

  const items = dedupeManualOrderItems(input.items);
  if (!items.length) throw new Error("At least one product is required to create an order.");

  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await findManualOrderByIdempotencyKey(idempotencyKey, email, env);
    if (existing) return existing;
  }

  const customer = await resolveManualOrderCustomer(
    {
      email,
      phone,
      fullName: input.fullName,
      customerUserId: input.customerUserId,
      createAccountIfMissing: input.createAccountIfMissing,
      actorId
    },
    env
  );

  const stockItems = await resolveCheckoutStockSkus(items, env);
  const catalog = await getCheckoutPricingBySlugs(stockItems.map((item) => item.productSlug));

  const billingAddress = input.billingSameAsShipping !== false && !input.billingAddress
    ? input.shippingAddress
    : input.billingAddress ?? input.shippingAddress;

  const shippingAmount = Math.max(0, Number(input.shippingAmount ?? 0));
  const discountAmount = Math.max(0, Number(input.discountAmount ?? 0));
  const payment = mapPaymentMethodToStatus(input.paymentMethod);

  const manualPaymentHoldMetadata = input.paymentMethod === "pending_payment"
    ? { payment_hold: "manual_admin" }
    : {};

  const draft = buildValidatedOrderDraft(
    {
      customerEmail: customer.email,
      phone: customer.phone,
      region: input.region ?? undefined,
      missionProfile: input.missionProfile ?? undefined,
      items: stockItems.map((item) => ({
        productSlug: item.productSlug,
        quantity: item.quantity,
        sku: item.sku ?? undefined
      })),
      metadata: {
        source: "admin_manual",
        payment_method: input.paymentMethod,
        ...manualPaymentHoldMetadata,
        customer_full_name: customer.displayName,
        customer_phone: customer.phone,
        customer_note: input.customerNote ?? null,
        internal_note: input.internalNote ?? null,
        shipping_amount: shippingAmount,
        discount_amount: discountAmount,
        guest_shipping_address: addressToMetadata(input.shippingAddress),
        shipping_address: addressToMetadata(input.shippingAddress),
        guest_billing_address: addressToMetadata(billingAddress),
        billing_address: addressToMetadata(billingAddress),
        billing_same_as_shipping: input.billingSameAsShipping !== false,
        ...(input.shippingAddressId ? { shipping_address_id: input.shippingAddressId } : {}),
        ...(input.billingSameAsShipping !== false && input.shippingAddressId
          ? { billing_address_id: input.shippingAddressId }
          : {}),
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {})
      }
    },
    catalog
  );

  draft.order.total = Math.max(0, draft.order.total + shippingAmount - discountAmount);

  const orderNumber = generateCustomerOrderNumber();
  const { orderId, orderRecord } = await persistValidatedOrderDraft(draft, {
    actorId,
    orderNumber,
    status: payment.status,
    paymentStatus: payment.paymentStatus,
    fulfillmentStatus: "pending",
    currency: "INR",
    channel: "checkout",
    createdByUserId: customer.userId,
    metadata: draft.order.metadata as JsonRecord,
    timelineNote: input.internalNote ?? "Manual order created by admin.",
    timelineSource: "admin_manual",
    warehouseCode: input.warehouseCode,
    changeSummary: `Create manual order for ${customer.email}`,
    env
  });

  if (payment.recordPayment && payment.paymentProvider) {
    await createAdminRecord(
      "payments",
      {
        order_id: orderId,
        provider: payment.paymentProvider,
        provider_intent_id: `manual-${orderId}`,
        provider_payment_id: `manual-${orderNumber}`,
        amount: draft.order.total,
        currency: "INR",
        status: "succeeded",
        verified_at: new Date().toISOString()
      },
      actorId,
      env
    );
  }

  if (input.sendCustomerNotification !== false) {
    await notifyCustomerAboutOrder(
      { ...orderRecord, id: orderId, order_number: orderNumber, created_by_user_id: customer.userId },
      "Order created",
      `Your order ${orderNumber} has been created. We'll keep you updated as it progresses.`,
      actorId,
      env
    );
  }

  return {
    orderId,
    orderNumber,
    customerUserId: customer.userId,
    total: draft.order.total,
    status: payment.status,
    paymentStatus: payment.paymentStatus
  };
}

export async function createStaffOrderFromWorkflowInput(
  input: {
    checkout: Parameters<typeof buildValidatedOrderDraft>[0];
    status: string;
    paymentStatus: string;
    fulfillmentStatus: string;
    currency: string;
    note: string | null;
    changeSummary: string;
    warehouseCode: string;
    orderNumber: string;
    createdByStaffId: string;
    timelineSource: string;
  },
  actorId: string,
  env: EnvSource = process.env
) {
  const stockItems = await resolveCheckoutStockSkus(input.checkout.items, env);
  const catalog = await getCheckoutPricingBySlugs(stockItems.map((item) => item.productSlug));
  const draft = buildValidatedOrderDraft(
    {
      ...input.checkout,
      items: stockItems.map((item) => ({
        productSlug: item.productSlug,
        quantity: item.quantity,
        sku: item.sku ?? undefined
      }))
    },
    catalog
  );

  return persistValidatedOrderDraft(draft, {
    actorId,
    orderNumber: input.orderNumber,
    status: input.status,
    paymentStatus: input.paymentStatus,
    fulfillmentStatus: input.fulfillmentStatus,
    currency: input.currency,
    channel: draft.order.channel,
    createdByUserId: null,
    createdByStaffId: input.createdByStaffId,
    metadata: draft.order.metadata as JsonRecord,
    timelineNote: input.note,
    timelineSource: input.timelineSource,
    warehouseCode: input.warehouseCode,
    changeSummary: input.changeSummary,
    env
  });
}
