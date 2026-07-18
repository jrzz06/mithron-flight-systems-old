import { assertSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout, SUPABASE_FETCH_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import { mergePaymentLifecycleMetadata } from "@/lib/orders/payment-lifecycle";
import { fetchAdminRecordsByColumn, updateAdminRecord } from "@/services/admin-actions";
import { appendOrderTimeline, buildOrderTimelineEntry, transitionOrderStatus } from "@/services/orders";
import { inrAmountsMatch, inrToPaise } from "./amount";
import { cashfreeCheckoutMode } from "./config";
import { razorpayKeyMode } from "./razorpay-payment-resolution";
import { confirmVerifiedPayment } from "./confirm-verified-payment";
import { fulfillOrderOnPaymentVerified } from "@/services/invoice/payment-fulfillment";
import { logPaymentEvent, logPaymentWarning } from "./logger";
import {
  hasSuccessfulGatewayPayment,
  isPendingGatewayPayment,
  reconcilePaymentWithGateway,
  scheduleGatewayReconcileFollowUp
} from "./reconcile-gateway-payment";
import { resolvePaymentRecordForEvent } from "./resolve-payment-record";
import type { CheckoutPaymentResponse, PaymentEvent, PaymentProviderId } from "./types";

type JsonRecord = Record<string, unknown>;

export function buildCheckoutPaymentResponse(input: {
  orderId: string;
  orderNumber: string;
  provider: PaymentProviderId;
  intent: {
    intentId: string;
    clientSecret?: string;
    checkoutUrl?: string;
    paymentSessionId?: string;
    amountPaise?: number;
  };
  amount: number;
  currency: string;
  env?: Record<string, string | undefined>;
}): CheckoutPaymentResponse {
  const env = input.env ?? process.env;
  return {
    ok: true,
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    paymentIntentId: input.intent.intentId,
    provider: input.provider,
    checkoutUrl: input.intent.checkoutUrl ?? null,
    clientSecret: input.intent.clientSecret ?? input.intent.paymentSessionId ?? null,
    paymentSessionId: input.intent.paymentSessionId ?? null,
    amount: input.amount,
    currency: input.currency,
    razorpayKeyId: input.provider === "razorpay" ? env.RAZORPAY_KEY_ID?.trim() ?? null : null,
    razorpayKeyMode:
      input.provider === "razorpay" && env.RAZORPAY_KEY_ID?.trim()
        ? razorpayKeyMode(env.RAZORPAY_KEY_ID)
        : null,
    razorpayUsesDashboardConfig:
      input.provider === "razorpay" && Boolean(env.RAZORPAY_CHECKOUT_CONFIG_ID?.trim()),
    cashfreeMode: input.provider === "cashfree" ? cashfreeCheckoutMode(env) : null,
    amountPaise: input.intent.amountPaise ?? inrToPaise(input.amount)
  };
}

/**
 * Claim a webhook event id for idempotency.
 * @returns `"claimed"` when this call inserted the row,
 * `"duplicate"` when the (provider, event_id) already exists,
 * `"unavailable"` when the insert could not be confirmed (network/5xx).
 */
export async function recordWebhookEvent(
  provider: string,
  eventId: string,
  payload: unknown
): Promise<"claimed" | "duplicate" | "unavailable"> {
  const config = assertSupabaseAdminConfig(process.env);
  try {
    const response = await fetchWithTimeout(
      `${config.url}/rest/v1/payment_webhook_events`,
      {
        method: "POST",
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          "Content-Type": "application/json",
          // Intentionally no ignore-duplicates: we need 409 to detect duplicates.
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          provider,
          event_id: eventId,
          payload,
          processed_at: new Date().toISOString()
        })
      },
      SUPABASE_FETCH_TIMEOUT_MS
    );
    if (response.status === 201) return "claimed";
    if (response.status === 409) return "duplicate";
    logPaymentWarning("webhook_event_claim_unexpected_status", {
      provider,
      eventId,
      status: response.status
    });
    return "unavailable";
  } catch (error) {
    logPaymentWarning("webhook_event_claim_failed", {
      provider,
      eventId,
      error: error instanceof Error ? error.message : String(error)
    });
    return "unavailable";
  }
}

async function createCustomerPaymentNotification(input: {
  recipientId: string | null;
  customerEmail: string | null;
  orderId: string;
  orderNumber: string;
  title?: string;
  body?: string;
  event?: string;
}) {
  const config = assertSupabaseAdminConfig(process.env);
  try {
    const { fetchWithTimeout } = await import("@/lib/fetch-with-timeout");
    const response = await fetchWithTimeout(`${config.url}/rest/v1/notifications`, {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        recipient_id: input.recipientId,
        channel: "customer",
        title: input.title ?? "Payment confirmed",
        body: input.body ?? `Your payment for order ${input.orderNumber} was successful. We'll notify you when it ships.`,
        status: "unread",
        priority: "normal",
        entity_table: "orders",
        entity_id: input.orderId,
        payload: {
          event: input.event ?? "payment.succeeded",
          recipient_email: input.customerEmail
        }
      })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logPaymentWarning("customer_notification_failed", {
        orderId: input.orderId,
        status: response.status,
        error: body.slice(0, 240) || `HTTP ${response.status}`
      });
    }
  } catch (error) {
    logPaymentWarning("customer_notification_failed", {
      orderId: input.orderId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function markPaymentInitiated(orderId: string, provider: PaymentProviderId, intentId: string) {
  const orders = await fetchAdminRecordsByColumn("orders", "id", orderId);
  const order = orders[0];
  if (!order) return;

  const metadata = mergePaymentLifecycleMetadata(
    (order.metadata && typeof order.metadata === "object" ? order.metadata : {}) as JsonRecord,
    {
      state: "PAYMENT_INITIATED",
      provider,
      providerIntentId: intentId,
      source: "checkout",
      note: "Gateway checkout session created."
    }
  );

  await updateAdminRecord(
    "orders",
    "id",
    orderId,
    {
      metadata,
      updated_at: new Date().toISOString()
    },
    null,
    process.env,
    { allowSystemActor: true }
  );
}

export async function markCheckoutPaymentInitiated(input: {
  orderId: string;
  provider: PaymentProviderId;
  intentId: string;
}) {
  await markPaymentInitiated(input.orderId, input.provider, input.intentId);
  logPaymentEvent("payment_initiated", {
    orderId: input.orderId,
    provider: input.provider,
    intentId: input.intentId
  });
}

export type ApplyPaymentEventResult =
  | { ok: true; status: PaymentEvent["status"]; skipped?: boolean; reason?: string }
  | { ok: false; status?: number; error: string };

function isTerminalPaidState(payment: JsonRecord, order?: JsonRecord | null) {
  return (
    String(payment.status ?? "") === "succeeded"
    || String(order?.payment_status ?? "") === "succeeded"
  );
}

async function processSucceededPaymentEvent(input: {
  provider: PaymentProviderId;
  event: PaymentEvent;
  source: "webhook" | "verify";
  eventId: string;
  payment: JsonRecord;
  orderId: string;
}): Promise<ApplyPaymentEventResult> {
  const { provider, source, eventId, payment, orderId } = input;
  let event = input.event;
  const paymentAmount = Number(payment.amount ?? 0);
  const paymentCurrency = String(payment.currency ?? "INR").trim().toUpperCase();
  const eventCurrency = String(event.currency ?? paymentCurrency).trim().toUpperCase();

  if (eventCurrency !== paymentCurrency) {
    const reconciled = await reconcilePaymentWithGateway({
      provider,
      intentId: event.intentId,
      expectedAmountInr: paymentAmount,
      expectedCurrency: paymentCurrency,
      maxAttempts: 1
    });
    if (!hasSuccessfulGatewayPayment(reconciled)) {
      logPaymentWarning("payment_currency_mismatch", {
        provider,
        intentId: event.intentId,
        expected: paymentCurrency,
        received: eventCurrency
      });
      return { ok: false, status: 400, error: "Payment currency mismatch." };
    }
    event = reconciled!;
  }

  if (!inrAmountsMatch(paymentAmount, event.amount)) {
    const paymentPaise = inrToPaise(paymentAmount);
    const eventPaise = inrToPaise(event.amount);
    const paiseMatch = paymentPaise === eventPaise;
    if (!paiseMatch && Math.abs(paymentPaise - eventPaise) > 1) {
      const reconciled = await reconcilePaymentWithGateway({
        provider,
        intentId: event.intentId,
        expectedAmountInr: paymentAmount,
        expectedCurrency: paymentCurrency,
        maxAttempts: 1
      });
      if (!hasSuccessfulGatewayPayment(reconciled)) {
        logPaymentWarning("payment_amount_mismatch", {
          provider,
          intentId: event.intentId,
          expected: paymentAmount,
          received: event.amount
        });
        return { ok: false, status: 400, error: "Payment amount mismatch." };
      }
      event = reconciled!;
    }
  }

  const confirmed = await confirmVerifiedPayment({
    paymentId: String(payment.id),
    orderId,
    provider,
    event,
    source,
    eventId
  });

  if (!confirmed.ok) {
    return { ok: false, status: confirmed.status ?? 400, error: confirmed.error };
  }

  if (!confirmed.skipped) {
    const orders = await fetchAdminRecordsByColumn("orders", "id", orderId);
    const order = orders[0];
    await createCustomerPaymentNotification({
      recipientId: typeof order?.created_by_user_id === "string" ? order.created_by_user_id : null,
      customerEmail: typeof order?.customer_email === "string" ? order.customer_email : null,
      orderId,
      orderNumber: String(order?.order_number ?? orderId)
    });
  }

  return {
    ok: true,
    status: "succeeded",
    skipped: confirmed.skipped,
    reason: confirmed.reason
  };
}

export async function applyPaymentEvent(input: {
  provider: PaymentProviderId;
  event: PaymentEvent;
  source: "webhook" | "verify";
  eventId?: string;
  rawPayload?: unknown;
}): Promise<ApplyPaymentEventResult> {
  const { provider, event, source } = input;
  const eventId = input.eventId ?? `${event.intentId}:${event.status}:${event.paymentId ?? "unknown"}`;
  let webhookEventClaimed = false;

  const payments = await resolvePaymentRecordForEvent(provider, event);
  const payment = payments;
  if (!payment) {
    logPaymentWarning("payment_record_missing", { provider, intentId: event.intentId, paymentId: event.paymentId ?? null });
    return { ok: false, status: 404, error: "Payment record not found." };
  }

  const orderId = String(payment.order_id ?? "");
  if (!orderId) {
    return { ok: false, status: 404, error: "Order not found for payment." };
  }

  const orders = await fetchAdminRecordsByColumn("orders", "id", orderId);
  const order = orders[0];

  if (isTerminalPaidState(payment, order)) {
    if (event.status === "succeeded") {
      await fulfillOrderOnPaymentVerified(orderId);
      return { ok: true, status: "succeeded", skipped: true, reason: "already_paid" };
    }

    logPaymentEvent("payment_downgrade_blocked", {
      orderId,
      provider,
      source,
      eventStatus: event.status,
      paymentStatus: String(payment.status ?? ""),
      orderPaymentStatus: String(order?.payment_status ?? "")
    });
    return { ok: true, status: event.status, skipped: true, reason: "already_paid" };
  }

  if (event.status === "failed") {
    // Claim the webhook event BEFORE gateway reconcile / order mutations so
    // duplicate failed deliveries cannot double-write. Succeeded events still
    // dedupe inside confirm_verified_payment RPC (do not claim here).
    if (source === "webhook") {
      const claim = await recordWebhookEvent(provider, eventId, input.rawPayload ?? event.raw);
      if (claim === "duplicate") {
        return { ok: true, status: event.status, skipped: true, reason: "duplicate_event" };
      }
      if (claim === "claimed") webhookEventClaimed = true;
      // On "unavailable", continue processing once — better than dropping a real failure.
    }

    const reconciled = await reconcilePaymentWithGateway({
      provider,
      intentId: event.intentId || String(payment.provider_intent_id ?? ""),
      expectedAmountInr: Number(payment.amount ?? 0),
      expectedCurrency: String(payment.currency ?? "INR"),
      maxAttempts: 1
    });

    if (hasSuccessfulGatewayPayment(reconciled)) {
      logPaymentEvent("payment_failure_reconciled_to_success", {
        orderId,
        provider,
        source,
        intentId: event.intentId,
        paymentId: reconciled?.paymentId ?? event.paymentId ?? null
      });
      const successEvent: PaymentEvent = {
        ...event,
        ...reconciled!,
        status: "succeeded"
      };
      const successEventId = eventId.includes("failed")
        ? eventId.replace("failed", "reconciled_success")
        : `${eventId}:reconciled_success`;
      return processSucceededPaymentEvent({
        provider,
        event: successEvent,
        source,
        eventId: successEventId,
        payment,
        orderId
      });
    }

    if (isPendingGatewayPayment(reconciled)) {
      scheduleGatewayReconcileFollowUp({
        provider,
        intentId: event.intentId || String(payment.provider_intent_id ?? ""),
        expectedAmountInr: Number(payment.amount ?? 0),
        expectedCurrency: String(payment.currency ?? "INR")
      });
      logPaymentEvent("payment_failure_deferred_pending", {
        orderId,
        provider,
        source,
        intentId: event.intentId
      });
      return { ok: true, status: "processing", skipped: true, reason: "gateway_pending" };
    }

    logPaymentEvent("payment_failure_confirmed", {
      orderId,
      provider,
      source,
      intentId: event.intentId,
      paymentId: event.paymentId ?? null
    });
  }

  if (event.status === "succeeded") {
    return processSucceededPaymentEvent({
      provider,
      event,
      source,
      eventId,
      payment,
      orderId
    });
  }

  if (source === "webhook" && !webhookEventClaimed) {
    // Non-failed, non-succeeded statuses (e.g. processing) claim here.
    // Failed events already claimed above; succeeded events claim in RPC.
    const claim = await recordWebhookEvent(provider, eventId, input.rawPayload ?? event.raw);
    if (claim === "duplicate") {
      return { ok: true, status: event.status, skipped: true, reason: "duplicate_event" };
    }
  }

  await updateAdminRecord(
    "payments",
    "id",
    String(payment.id),
    {
      status: String(payment.status ?? "") === "succeeded" ? "succeeded" : event.status,
      provider_intent_id: event.intentId || String(payment.provider_intent_id ?? ""),
      provider_payment_id: event.paymentId ?? null,
      webhook_payload: event.raw as JsonRecord,
      verified_at: null,
      updated_at: new Date().toISOString()
    },
    null,
    process.env,
    { allowSystemActor: true }
  );

  if (!order) {
    return { ok: true, status: event.status };
  }

  const baseMetadata =
    (order.metadata && typeof order.metadata === "object" ? order.metadata : {}) as JsonRecord;

  if (event.status === "failed") {
    await updateAdminRecord(
      "orders",
      "id",
      orderId,
      {
        status: "cancelled",
        payment_status: "failed",
        metadata: mergePaymentLifecycleMetadata(baseMetadata, {
          state: "FAILED",
          provider,
          providerIntentId: event.intentId,
          providerPaymentId: event.paymentId,
          source,
          note: "Gateway reported payment failure."
        }),
        updated_at: new Date().toISOString()
      },
      null,
      process.env,
      { allowSystemActor: true }
    );

    logPaymentEvent("payment_failed", { orderId, provider, source });
    return { ok: true, status: event.status };
  }

  if (event.status === "processing") {
    await updateAdminRecord(
      "orders",
      "id",
      orderId,
      {
        payment_status: "processing",
        metadata: mergePaymentLifecycleMetadata(baseMetadata, {
          state: "PAYMENT_PROCESSING",
          provider,
          providerIntentId: event.intentId,
          providerPaymentId: event.paymentId,
          source
        }),
        updated_at: new Date().toISOString()
      },
      null,
      process.env,
      { allowSystemActor: true }
    );
    return { ok: true, status: event.status };
  }

  if (event.status === "refunded") {
    const currentStatus = String(order.status ?? "paid");
    let nextStatus: string = "refunded";
    try {
      nextStatus = transitionOrderStatus(currentStatus, "refunded");
    } catch {
      nextStatus = "refunded";
    }

    const timeline = appendOrderTimeline(
      order.timeline,
      buildOrderTimelineEntry({
        status: nextStatus,
        event: "payment.refunded",
        note: "Payment refunded via provider webhook.",
        actorId: null,
        metadata: { payment_status: "refunded", provider }
      })
    );

    await updateAdminRecord(
      "orders",
      "id",
      orderId,
      {
        status: nextStatus,
        payment_status: "refunded",
        timeline,
        metadata: mergePaymentLifecycleMetadata(baseMetadata, {
          state: "REFUNDED",
          provider,
          providerIntentId: event.intentId,
          providerPaymentId: event.paymentId,
          source,
          note: "Payment refunded."
        }),
        updated_at: new Date().toISOString()
      },
      null,
      process.env,
      { allowSystemActor: true }
    );

    await createCustomerPaymentNotification({
      recipientId: typeof order.created_by_user_id === "string" ? order.created_by_user_id : null,
      customerEmail: typeof order.customer_email === "string" ? order.customer_email : null,
      orderId,
      orderNumber: String(order.order_number ?? orderId),
      title: "Payment refunded",
      body: `Your payment for order ${String(order.order_number ?? orderId)} has been refunded.`,
      event: "payment.refunded"
    });

    logPaymentEvent("payment_refunded", { orderId, provider, source });
    return { ok: true, status: event.status };
  }

  return { ok: true, status: event.status };
}
