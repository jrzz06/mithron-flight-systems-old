import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { requireClientAuditToken } from "@/lib/api/require-client-audit-token";
import { createClient } from "@/lib/server";
import { fetchAdminRecordsByColumn } from "@/services/admin-actions";
import { applyPaymentEvent } from "@/services/payments/confirm-payment";
import { fulfillOrderOnPaymentVerified, getPaidOrderFulfillment } from "@/services/invoice/payment-fulfillment";
import { isPaymentProviderId } from "@/services/payments/gateway";
import { logPaymentError, logPaymentEvent } from "@/services/payments/logger";
import { verifyCashfreePaymentOnServer } from "@/services/payments/verify-cashfree-server";
import { verifyRazorpayPaymentOnServer } from "@/services/payments/verify-razorpay-server";
import type { PaymentProviderId } from "@/services/payments/types";

type VerifyBody = {
  orderId?: string;
  provider?: string;
  email?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  cashfreeOrderId?: string;
};

type JsonRecord = Record<string, unknown>;

async function assertOrderAccess(input: {
  orderId: string;
  userId: string | null;
  email?: string;
  request: Request;
}) {
  const orders = await fetchAdminRecordsByColumn("orders", "id", input.orderId);
  const order = orders[0];
  if (!order) return { ok: false as const, status: 404, error: "Order not found." };

  if (input.userId) {
    const ownerId = typeof order.created_by_user_id === "string" ? order.created_by_user_id : null;
    if (ownerId === input.userId) {
      return { ok: true as const, order };
    }
    return { ok: false as const, status: 404, error: "Order not found." };
  }

  const audit = requireClientAuditToken(input.request);
  if (!audit.ok) {
    return { ok: false as const, status: 401, error: audit.error };
  }

  const orderEmail = String(order.customer_email ?? "").trim().toLowerCase();
  const requestEmail = input.email?.trim().toLowerCase() ?? "";
  if (!requestEmail || orderEmail !== requestEmail) {
    return { ok: false as const, status: 403, error: "Email does not match order." };
  }

  return { ok: true as const, order };
}

function selectPaymentForVerify(payments: JsonRecord[], provider: string) {
  const providerPayments = payments.filter((row) => String(row.provider ?? "") === provider);
  return (
    providerPayments.find((row) => String(row.status ?? "") === "succeeded")
    ?? providerPayments.find((row) => !["failed", "refunded"].includes(String(row.status ?? "")))
    ?? providerPayments.find((row) => String(row.status ?? "") === "failed")
    ?? providerPayments[0]
  );
}

function buildVerifySuccessResponse(input: {
  orderId: string;
  order: JsonRecord;
  fulfillment: Awaited<ReturnType<typeof getPaidOrderFulfillment>>;
  skipped?: boolean;
}) {
  return NextResponse.json({
    ok: true,
    paid: true,
    paymentStatus: "succeeded",
    orderPaymentStatus: "succeeded",
    orderId: input.orderId,
    orderNumber: String(input.order.order_number ?? input.orderId),
    total: Number(input.order.total ?? 0),
    amount: Number(input.order.total ?? 0),
    invoiceNumber: input.fulfillment?.invoiceNumber ?? null,
    invoiceUrl: input.fulfillment?.invoiceUrl ?? null,
    emailSent: input.fulfillment?.emailSent ?? false,
    customerEmail: input.fulfillment?.customerEmail ?? String(input.order.customer_email ?? ""),
    skipped: input.skipped ?? false
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as VerifyBody | null;
  const orderId = body?.orderId?.trim() ?? "";
  const provider = body?.provider?.trim().toLowerCase() ?? "";

  if (!orderId || !provider || !isPaymentProviderId(provider) || provider === "stub" || provider === "stripe") {
    return NextResponse.json({ error: "Valid orderId and payment provider are required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  const rateKey = userId ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`payments-verify:${rateKey}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const access = await assertOrderAccess({
    orderId,
    userId,
    email: body?.email,
    request
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const payments = await fetchAdminRecordsByColumn("payments", "order_id", orderId);
  const payment = selectPaymentForVerify(payments, provider);
  if (!payment?.provider_intent_id) {
    return NextResponse.json({ error: "No active payment session found for this order." }, { status: 404 });
  }

  if (String(payment.status ?? "") === "succeeded" || String(access.order.payment_status ?? "") === "succeeded") {
    logPaymentEvent("payment_verify_already_paid", { orderId, provider });
    await fulfillOrderOnPaymentVerified(orderId);
    const fulfillment = await getPaidOrderFulfillment(orderId);
    return buildVerifySuccessResponse({ orderId, order: access.order, fulfillment });
  }

  try {
    let event;
    if (provider === "razorpay") {
      const paymentId = body?.razorpayPaymentId?.trim() ?? "";
      const signature = body?.razorpaySignature?.trim() ?? "";
      if (!paymentId || !signature) {
        return NextResponse.json({ error: "Razorpay payment verification fields are required." }, { status: 400 });
      }

      event = await verifyRazorpayPaymentOnServer({
        internalOrderId: orderId,
        storedRazorpayOrderId: String(payment.provider_intent_id),
        clientRazorpayOrderId: body?.razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
        expectedAmountInr: Number(payment.amount ?? access.order.total ?? 0),
        expectedCurrency: String(payment.currency ?? access.order.currency ?? "INR")
      });
    } else {
      const intentId = body?.cashfreeOrderId?.trim() || String(payment.provider_intent_id);
      event = await verifyCashfreePaymentOnServer({
        internalOrderId: orderId,
        cashfreeOrderId: intentId,
        expectedAmountInr: Number(payment.amount ?? access.order.total ?? 0),
        expectedCurrency: String(payment.currency ?? access.order.currency ?? "INR")
      });
    }

    if (event.status !== "succeeded") {
      logPaymentEvent("payment_verify_not_succeeded", {
        orderId,
        provider,
        gatewayStatus: event.status
      });
      return NextResponse.json({
        ok: true,
        paid: false,
        retryable: event.status === "requires_payment" || event.status === "processing",
        paymentStatus: event.status,
        orderPaymentStatus: String(access.order.payment_status ?? ""),
        error: event.status === "failed"
          ? "Payment failed at the gateway. You can retry checkout."
          : "Payment is still processing on the gateway. We will confirm it shortly."
      });
    }

    const verifyEventId = `verify:${provider}:${event.paymentId ?? event.intentId}`;
    const result = await applyPaymentEvent({
      provider: provider as PaymentProviderId,
      event,
      source: "verify",
      eventId: verifyEventId
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    }

    logPaymentEvent("payment_verified_via_api", { orderId, provider, source: "verify" });
    const fulfillment = await getPaidOrderFulfillment(orderId);
    return buildVerifySuccessResponse({
      orderId,
      order: access.order,
      fulfillment,
      skipped: result.skipped
    });
  } catch (error) {
    logPaymentError("payment_verify_failed", error, { orderId, provider });
    const message = error instanceof Error ? error.message : "Payment verification failed.";
    const statusCode = /signature|unauthorized|invalid|mismatch/i.test(message) ? 401 : 400;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
