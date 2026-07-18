import { NextResponse } from "next/server";
import { acquireRedisLockStrict, releaseRedisLock } from "@/lib/cache-redis";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { parseCheckoutRequestBody } from "@/lib/api/checkout-schema";
import { buildCheckoutAddressMetadata } from "@/lib/addresses/resolve-server";
import { requireClientAuditToken } from "@/lib/api/require-client-audit-token";
import { createClient } from "@/lib/server";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { assertCustomerAddressBelongsToUser } from "@/services/customer-addresses";
import {
  createCustomerCheckoutOrderAtomic,
  createCustomerCheckoutPaymentRecord,
  fetchAdminRecordsByColumn,
  updateAdminRecord
} from "@/services/admin-actions";
import { buildCustomerCheckoutDraft } from "@/services/orders";
import {
  CheckoutStockVerificationError,
  CheckoutWarehouseConfigurationError,
  prepareCheckoutStock,
  releaseCheckoutStock
} from "@/services/checkout-stock";
import {
  buildCheckoutPaymentResponse,
  markCheckoutPaymentInitiated
} from "@/services/payments/confirm-payment";
import {
  createPaymentIntent,
  isPaymentGatewayConfigured,
  isPaymentProviderId,
  resolveCheckoutPaymentProvider
} from "@/services/payments/gateway";
import { logPaymentError } from "@/services/payments/logger";
import { getCheckoutPricingBySlugs } from "@/services/catalog";
import { isStaleCheckoutPayment } from "@/lib/checkout/stale-payment-intent";
import { refreshCheckoutPaymentIntent } from "@/services/payments/refresh-checkout-intent";
import type { CheckoutPaymentResponse, PaymentProviderId } from "@/services/payments/types";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function findCheckoutByIdempotencyKey(
  idempotencyKey: string,
  scope: { userId: string } | { guestEmail: string; guestPhone: string },
  options?: { refreshIfStale?: boolean }
): Promise<CheckoutPaymentResponse | null> {
  const config = assertSupabaseAdminConfig(process.env);
  const filter =
    "userId" in scope
      ? `created_by_user_id=eq.${scope.userId}`
      : `created_by_user_id=is.null&customer_email=eq.${encodeURIComponent(scope.guestEmail.trim())}&metadata->>customer_phone=eq.${encodeURIComponent(scope.guestPhone.trim())}`;

  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/orders?select=id,order_number,total,currency,status,payment_status,metadata,customer_email,created_at&${filter}&metadata->>idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      },
      cache: "no-store"
    }
  );
  if (!response.ok) return null;

  const rows = (await response.json()) as Array<Record<string, unknown>>;
  const order = rows[0];
  if (!order?.id) return null;
  if (String(order.status ?? "") === "cancelled" || String(order.payment_status ?? "") === "succeeded") {
    return null;
  }

  const orderId = String(order.id);
  const payments = await fetchAdminRecordsByColumn("payments", "order_id", orderId);
  const payment = payments.find((row) => !["failed", "cancelled"].includes(String(row.status ?? ""))) ?? payments[0];
  if (!payment?.provider_intent_id) return null;

  const provider = String(payment.provider ?? process.env.PAYMENT_PROVIDER ?? "razorpay");
  if (!isPaymentProviderId(provider)) return null;

  const paymentCreatedAt = String(payment.created_at ?? payment.updated_at ?? order.created_at ?? "");
  if (
    options?.refreshIfStale !== false
    && isStaleCheckoutPayment(paymentCreatedAt)
    && String(payment.status ?? "") === "requires_payment"
  ) {
    const metadata = order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
      ? (order.metadata as Record<string, unknown>)
      : {};
    const customerPhone =
      "guestPhone" in scope
        ? scope.guestPhone
        : typeof metadata.customer_phone === "string"
          ? metadata.customer_phone
          : undefined;

    return refreshCheckoutPaymentIntent({
      order,
      payment,
      provider,
      customerEmail: String(order.customer_email ?? ""),
      customerPhone,
      actorId: "userId" in scope ? scope.userId : null
    });
  }

  const webhookPayload =
    payment.webhook_payload && typeof payment.webhook_payload === "object" && !Array.isArray(payment.webhook_payload)
      ? (payment.webhook_payload as Record<string, unknown>)
      : {};
  const paymentSessionId =
    typeof webhookPayload.payment_session_id === "string" ? webhookPayload.payment_session_id : null;

  return buildCheckoutPaymentResponse({
    orderId,
    orderNumber: String(order.order_number ?? orderId),
    provider,
    intent: {
      intentId: String(payment.provider_intent_id),
      clientSecret: provider === "cashfree" ? paymentSessionId ?? String(payment.provider_intent_id) : String(payment.provider_intent_id),
      paymentSessionId: paymentSessionId ?? undefined
    },
    amount: Number(payment.amount ?? order.total ?? 0),
    currency: String(payment.currency ?? order.currency ?? "INR")
  });
}

function isDuplicateIdempotencyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("23505") || /duplicate key|idempotency_key/i.test(message);
}

async function cancelCheckoutOrder(orderId: string, actorId: string | null, reason: string) {
  await updateAdminRecord(
    "orders",
    "id",
    orderId,
    {
      status: "cancelled",
      payment_status: "failed",
      metadata: { cancellation_reason: reason },
      updated_at: new Date().toISOString()
    },
    actorId,
    process.env,
    actorId ? {} : { allowSystemActor: true }
  );
  await releaseCheckoutStock(orderId).catch((error) => {
    logPaymentError("checkout_stock_release_failed", error, { orderId, reason });
  });
}

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get("X-Idempotency-Key")?.trim() ?? "";
  if (idempotencyKey && !UUID_V4.test(idempotencyKey)) {
    return NextResponse.json({ error: "We couldn't process that. Please refresh and try again." }, { status: 400 });
  }
  const rawBody = await request.json().catch(() => null);
  const body = parseCheckoutRequestBody(rawBody);

  if (!body) {
    return NextResponse.json({ error: "Valid full name, email, phone, and cart items are required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  const rateKey = userId ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`checkout:${rateKey}`, 5, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  if (!userId) {
    const audit = requireClientAuditToken(request);
    if (!audit.ok) {
      return NextResponse.json({ error: audit.error }, { status: 401 });
    }
  }

  if (process.env.NODE_ENV === "production" && !isPaymentGatewayConfigured()) {
    return NextResponse.json(
      { error: "Online payments aren't available right now. Please try again later or contact us to place an order." },
      { status: 503 }
    );
  }

  let paymentProvider: PaymentProviderId;
  try {
    paymentProvider = resolveCheckoutPaymentProvider(body.paymentProvider);
  } catch {
    return NextResponse.json({ error: "Online payments aren't available right now." }, { status: 503 });
  }

  if (!body.addressId && !body.guestAddress) {
    return NextResponse.json({ error: "A shipping address is required to pay online." }, { status: 400 });
  }

  if (body.addressId && !userId) {
    return NextResponse.json({ error: "Sign in to use a saved address, or enter a shipping address below." }, { status: 400 });
  }

  let redisLockKey: string | null = null;
  if (idempotencyKey) {
    redisLockKey = `idempotency:checkout:${idempotencyKey}`;
    const lockOutcome = await acquireRedisLockStrict(redisLockKey, 120);
    if (lockOutcome === "unavailable") {
      return NextResponse.json(
        { error: "Checkout temporarily unavailable. Please try again in a moment." },
        { status: 503 }
      );
    }
    if (lockOutcome === "held") {
      const existing = userId
        ? await findCheckoutByIdempotencyKey(idempotencyKey, { userId })
        : await findCheckoutByIdempotencyKey(idempotencyKey, { guestEmail: body.email, guestPhone: body.phone });
      if (existing) {
        return NextResponse.json(existing);
      }
      return NextResponse.json({ error: "Checkout already in progress. Please wait a moment." }, { status: 409 });
    }

    const existing = userId
      ? await findCheckoutByIdempotencyKey(idempotencyKey, { userId })
      : await findCheckoutByIdempotencyKey(idempotencyKey, { guestEmail: body.email, guestPhone: body.phone });
    if (existing) {
      await releaseRedisLock(redisLockKey).catch(() => undefined);
      return NextResponse.json(existing);
    }
  }

  try {
  if (body.addressId && userId) {
    try {
      await assertCustomerAddressBelongsToUser(userId, body.addressId, process.env, { requireShipping: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid shipping address for this account.";
      return NextResponse.json({ error: message }, { status: 403 });
    }
  }

  if (body.billingAddressId && userId) {
    try {
      await assertCustomerAddressBelongsToUser(userId, body.billingAddressId, process.env, { requireBilling: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid billing address for this account.";
      return NextResponse.json({ error: message }, { status: 403 });
    }
  }

  if (!body.billingSameAsShipping && !body.billingAddressId && !body.guestBillingAddress) {
    return NextResponse.json({ error: "A billing address is required when it differs from shipping." }, { status: 400 });
  }

  let stockItems;
  let catalog;
  try {
    [stockItems, catalog] = await Promise.all([
      prepareCheckoutStock(body.items),
      getCheckoutPricingBySlugs(body.items.map((item) => item.productSlug))
    ]);
  } catch (error) {
    if (error instanceof CheckoutWarehouseConfigurationError) {
      logPaymentError("checkout_stock_verification_failed", error);
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const internal = error instanceof Error ? error.message : "Unable to resolve product inventory.";
    const stockContext = error instanceof CheckoutStockVerificationError
      ? {
          warehouseCode: error.warehouseCode,
          stockIssues: JSON.stringify(
            error.issues.map((issue) => ({
              productSlug: issue.productSlug,
              requested: issue.requested,
              available: issue.available,
              hasWarehouseRow: issue.hasWarehouseRow
            }))
          )
        }
      : {};
    logPaymentError(
      error instanceof CheckoutStockVerificationError ? "checkout_stock_verification_failed" : "checkout_catalog_load_failed",
      error,
      stockContext
    );
    const isStockError = error instanceof CheckoutStockVerificationError || /insufficient stock|out of stock/i.test(internal);
    if (isStockError) {
      return NextResponse.json(
        { error: "One or more items are out of stock or unavailable." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "We couldn't load prices right now. Please try again." }, { status: 503 });
  }

  const catalogSlugs = new Set(catalog.map((product) => product.slug));
  const unavailableSlugs = body.items
    .map((item) => item.productSlug)
    .filter((slug) => !catalogSlugs.has(slug));
  if (unavailableSlugs.length) {
    return NextResponse.json(
      { error: "One or more products are no longer available for checkout." },
      { status: 409 }
    );
  }

  let addressMetadata;
  try {
    addressMetadata = await buildCheckoutAddressMetadata(
      {
        addressId: body.addressId,
        billingAddressId: body.billingAddressId,
        guestAddress: body.guestAddress,
        guestBillingAddress: body.guestBillingAddress,
        billingSameAsShipping: body.billingSameAsShipping
      },
      userId
    );
  } catch (error) {
    logPaymentError("checkout_address_resolution_failed", error);
    const message = error instanceof Error ? error.message : "Unable to resolve shipping address.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let draft;
  try {
    const lineMetaBySlug = new Map(
      body.items.map((item) => [
        item.productSlug,
        { bundleId: item.bundleId, variantId: item.variantId }
      ] as const)
    );
    draft = buildCustomerCheckoutDraft(
      {
        customerEmail: body.email,
        phone: body.phone,
        region: body.region,
        items: stockItems.map((item) => {
          const meta = lineMetaBySlug.get(item.productSlug);
          return {
            productSlug: item.productSlug,
            quantity: item.quantity,
            bundleId: meta?.bundleId ?? "standard",
            sku: item.sku ?? undefined
          };
        }),
        metadata: {
          ...addressMetadata,
          customer_full_name: body.fullName,
          ...(body.company ? { customer_company: body.company } : {}),
          ...(body.promoCode ? { promo_code: body.promoCode } : {}),
          ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
          payment_provider: paymentProvider
        }
      },
      catalog,
      userId
    );
  } catch (error) {
    logPaymentError("checkout_draft_build_failed", error);
    const message = error instanceof Error ? error.message : "Unable to prepare your order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const orderNumber = `ORD-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  let orderId = "";
  try {
    const atomic = await createCustomerCheckoutOrderAtomic(
      {
        ...draft.order,
        created_by_user_id: userId,
        order_number: orderNumber,
        items: draft.orderItems,
        ...(typeof addressMetadata.shipping_address_id === "string"
          ? { shipping_address_id: addressMetadata.shipping_address_id }
          : {}),
        ...(typeof addressMetadata.billing_address_id === "string"
          ? { billing_address_id: addressMetadata.billing_address_id }
          : {})
      },
      draft.orderItems,
      userId
    );
    orderId = atomic.order_id;
  } catch (error) {
    if (idempotencyKey && isDuplicateIdempotencyError(error)) {
      const existing = userId
        ? await findCheckoutByIdempotencyKey(idempotencyKey, { userId })
        : await findCheckoutByIdempotencyKey(idempotencyKey, { guestEmail: body.email, guestPhone: body.phone });
      if (existing) {
        return NextResponse.json(existing);
      }
    }
    const message = error instanceof Error ? error.message : "Order creation failed.";
    if (/Insufficient stock|No inventory/i.test(message)) {
      logPaymentError("checkout_stock_reservation_failed", error, { idempotencyKey: idempotencyKey || null });
      return NextResponse.json(
        { error: "One or more items are out of stock or unavailable." },
        { status: 409 }
      );
    }
    logPaymentError("checkout_order_create_failed", error, { idempotencyKey: idempotencyKey || null });
    return NextResponse.json({ error: "Order creation failed." }, { status: 500 });
  }

  if (!orderId) {
    return NextResponse.json({ error: "Order creation failed." }, { status: 500 });
  }

  let intent;
  try {
    intent = await createPaymentIntent(
      {
        orderId,
        amount: draft.order.total,
        currency: draft.order.currency,
        customerEmail: body.email,
        customerPhone: body.phone,
        metadata: {
          address_id: body.addressId ?? "",
          phone: body.phone,
          receipt: orderNumber
        }
      },
      paymentProvider
    );
  } catch (error) {
    await cancelCheckoutOrder(orderId, userId, "payment_intent_failed");
    logPaymentError("checkout_payment_intent_failed", error, { orderId, provider: paymentProvider });
    return NextResponse.json({ error: "Payment service is unavailable. Please try again shortly." }, { status: 503 });
  }

  try {
    await createCustomerCheckoutPaymentRecord(
      {
        order_id: orderId,
        provider: paymentProvider,
        provider_intent_id: intent.intentId,
        amount: draft.order.total,
        currency: draft.order.currency,
        status: "requires_payment",
        webhook_payload: {
          internal_order_id: orderId,
          order_number: orderNumber,
          merchant_order_id: intent.providerOrderId ?? intent.intentId,
          ...(intent.paymentSessionId ? { payment_session_id: intent.paymentSessionId } : {}),
          ...(paymentProvider === "razorpay" ? { razorpay_order_id: intent.intentId } : {})
        }
      },
      userId
    );
  } catch (error) {
    await cancelCheckoutOrder(orderId, userId, "payment_record_failed");
    logPaymentError("checkout_payment_record_failed", error, { orderId, provider: paymentProvider });
    return NextResponse.json({ error: "Unable to process your order at this time." }, { status: 500 });
  }

  await markCheckoutPaymentInitiated({
    orderId,
    provider: paymentProvider,
    intentId: intent.intentId
  });

  return NextResponse.json(
    buildCheckoutPaymentResponse({
      orderId,
      orderNumber,
      provider: paymentProvider,
      intent,
      amount: draft.order.total,
      currency: draft.order.currency
    })
  );
  } finally {
    if (redisLockKey) {
      await releaseRedisLock(redisLockKey).catch(() => undefined);
    }
  }
}
