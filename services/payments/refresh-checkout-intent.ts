import { updateAdminRecord } from "@/services/admin-actions";
import { createPaymentIntent } from "@/services/payments/gateway";
import { logPaymentEvent } from "@/services/payments/logger";
import type { CheckoutPaymentResponse, PaymentProviderId } from "@/services/payments/types";
import { buildCheckoutPaymentResponse } from "./confirm-payment";

type PaymentRow = Record<string, unknown>;
type OrderRow = Record<string, unknown>;

export async function refreshCheckoutPaymentIntent(input: {
  order: OrderRow;
  payment: PaymentRow;
  provider: PaymentProviderId;
  customerEmail: string;
  customerPhone?: string;
  actorId: string | null;
}): Promise<CheckoutPaymentResponse> {
  const orderId = String(input.order.id ?? "");
  const orderNumber = String(input.order.order_number ?? orderId);
  const amount = Number(input.payment.amount ?? input.order.total ?? 0);
  const currency = String(input.payment.currency ?? input.order.currency ?? "INR");
  const previousIntentId = String(input.payment.provider_intent_id ?? "");

  const intent = await createPaymentIntent(
    {
      orderId,
      amount,
      currency,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      metadata: {
        phone: input.customerPhone ?? "",
        receipt: orderNumber.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)
      }
    },
    input.provider
  );

  const webhookPayload =
    input.payment.webhook_payload && typeof input.payment.webhook_payload === "object" && !Array.isArray(input.payment.webhook_payload)
      ? (input.payment.webhook_payload as Record<string, unknown>)
      : {};

  await updateAdminRecord(
    "payments",
    "id",
    String(input.payment.id),
    {
      provider_intent_id: intent.intentId,
      status: "requires_payment",
      webhook_payload: {
        ...webhookPayload,
        internal_order_id: orderId,
        order_number: orderNumber,
        merchant_order_id: intent.providerOrderId ?? intent.intentId,
        ...(intent.paymentSessionId ? { payment_session_id: intent.paymentSessionId } : {}),
        ...(input.provider === "razorpay" ? { razorpay_order_id: intent.intentId } : {}),
        refreshed_from_intent_id: previousIntentId || null,
        refreshed_at: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    },
    input.actorId,
    process.env,
    input.actorId ? {} : { allowSystemActor: true }
  );

  logPaymentEvent("checkout_payment_intent_refreshed", {
    orderId,
    provider: input.provider,
    previousIntentId: previousIntentId || null,
    intentId: intent.intentId
  });

  return buildCheckoutPaymentResponse({
    orderId,
    orderNumber,
    provider: input.provider,
    intent,
    amount,
    currency
  });
}
