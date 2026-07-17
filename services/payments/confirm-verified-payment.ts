import { assertSupabaseAdminConfig } from "@/lib/env";
import { mergePaymentLifecycleMetadata } from "@/lib/orders/payment-lifecycle";
import { fetchAdminRecordsByColumn, updateAdminRecord } from "@/services/admin-actions";
import { getCheckoutWarehouseCode } from "@/services/warehouse-config";
import { fulfillOrderOnPaymentVerified } from "@/services/invoice/payment-fulfillment";
import { notifyAdminsAboutPaidOrder } from "@/services/enquiries";
import { logPaymentEvent, logPaymentWarning } from "./logger";
import type { PaymentEvent, PaymentProviderId } from "./types";

type JsonRecord = Record<string, unknown>;

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

function readRazorpayPaymentMethod(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const method = (raw as JsonRecord).method;
  return typeof method === "string" && method.trim() ? method.trim() : null;
}

export type ConfirmVerifiedPaymentInput = {
  paymentId: string;
  orderId: string;
  provider: PaymentProviderId;
  event: PaymentEvent;
  source: "verify" | "webhook";
  eventId: string;
};

export type ConfirmVerifiedPaymentResult =
  | { ok: true; skipped: boolean; reason?: string; orderId: string }
  | { ok: false; error: string; status?: number };

export async function confirmVerifiedPayment(
  input: ConfirmVerifiedPaymentInput,
  env: Record<string, string | undefined> = process.env
): Promise<ConfirmVerifiedPaymentResult> {
  const config = assertSupabaseAdminConfig(env);
  const warehouseCode = (await getCheckoutWarehouseCode(env)).trim() || null;
  const paymentMethod =
    input.provider === "razorpay" ? readRazorpayPaymentMethod(input.event.raw) : null;

  logPaymentEvent("confirm_verified_payment_start", {
    orderId: input.orderId,
    provider: input.provider,
    source: input.source,
    eventId: input.eventId,
    providerPaymentId: input.event.paymentId ?? null
  });

  const response = await fetch(`${config.url}/rest/v1/rpc/confirm_verified_payment`, {
    method: "POST",
    headers: headers(config.serviceRoleKey),
    body: JSON.stringify({
      p_payment_id: input.paymentId,
      p_order_id: input.orderId,
      p_provider: input.provider,
      p_provider_intent_id: input.event.intentId,
      p_provider_payment_id: input.event.paymentId ?? null,
      p_gateway_payload: input.event.raw ?? {},
      p_event_id: input.eventId,
      p_source: input.source,
      p_warehouse_code: warehouseCode,
      p_payment_method: paymentMethod,
      p_verified_at: new Date().toISOString()
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logPaymentWarning("confirm_verified_payment_rpc_failed", {
      orderId: input.orderId,
      status: response.status,
      body: body.slice(0, 300)
    });
    return { ok: false, error: "Payment confirmation failed.", status: 500 };
  }

  const result = (await response.json()) as JsonRecord;
  if (result.ok !== true) {
    const error = typeof result.error === "string" ? result.error : "Payment confirmation rejected.";
    logPaymentWarning("confirm_verified_payment_rejected", {
      orderId: input.orderId,
      error
    });
    const status =
      error === "order_not_payable" ? 409
      : error === "provider_intent_mismatch" || error === "payment_order_mismatch" ? 400
      : 404;
    return { ok: false, error, status };
  }

  const skipped = result.skipped === true;
  const reason = typeof result.reason === "string" ? result.reason : undefined;

  if (!skipped) {
    const orders = await fetchAdminRecordsByColumn("orders", "id", input.orderId);
    const order = orders[0];
    if (order) {
      const baseMetadata =
        (order.metadata && typeof order.metadata === "object" ? order.metadata : {}) as JsonRecord;
      await updateAdminRecord(
        "orders",
        "id",
        input.orderId,
        {
          metadata: {
            ...mergePaymentLifecycleMetadata(baseMetadata, {
              state: "PAYMENT_VERIFIED",
              provider: input.provider,
              providerIntentId: input.event.intentId,
              providerPaymentId: input.event.paymentId,
              source: input.source,
              note: "Payment verified by server."
            }),
            payment_provider: input.provider,
            ...(paymentMethod ? { payment_method: paymentMethod } : {})
          },
          updated_at: new Date().toISOString()
        },
        null,
        env,
        { allowSystemActor: true }
      );
    }

    await notifyAdminsAboutPaidOrder({
      orderId: input.orderId,
      orderNumber: String(order?.order_number ?? input.orderId)
    });

    logPaymentEvent("payment_verified", {
      orderId: input.orderId,
      provider: input.provider,
      source: input.source
    });
  } else {
    logPaymentEvent("confirm_verified_payment_skipped", {
      orderId: input.orderId,
      reason: reason ?? "unknown"
    });
  }

  await fulfillOrderOnPaymentVerified(input.orderId, env);

  return {
    ok: true,
    skipped,
    reason,
    orderId: input.orderId
  };
}
