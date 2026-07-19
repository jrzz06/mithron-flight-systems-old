import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { requireClientAuditToken } from "@/lib/api/require-client-audit-token";
import { createClient } from "@/lib/server";
import { fetchAdminRecordsByColumn } from "@/services/admin-actions";
import { fetchCheckoutOrderStatus } from "@/services/customer-orders";
import { applyPaymentEvent } from "@/services/payments/confirm-payment";
import { isPaymentProviderId } from "@/services/payments/gateway";
import { logPaymentEvent } from "@/services/payments/logger";
import {
  hasSuccessfulGatewayPayment,
  isPendingGatewayPayment,
  reconcilePaymentWithGateway,
  scheduleGatewayReconcileFollowUp
} from "@/services/payments/reconcile-gateway-payment";
import type { PaymentProviderId } from "@/services/payments/types";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const orderId = requestUrl.searchParams.get("orderId")?.trim() ?? "";
  const guestEmail = requestUrl.searchParams.get("email")?.trim() ?? "";

  if (!orderId) {
    return NextResponse.json({ error: "orderId is required." }, { status: 400 });
  }

  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`checkout-status:${rateKey}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  if (!userId) {
    const audit = requireClientAuditToken(request);
    if (!audit.ok) {
      return NextResponse.json({ error: audit.error }, { status: 401 });
    }
    if (!guestEmail) {
      return NextResponse.json({ error: "email is required for guest checkout status." }, { status: 400 });
    }
  }

  let status = userId
    ? await fetchCheckoutOrderStatus(orderId, { userId })
    : await fetchCheckoutOrderStatus(orderId, { guestEmail });

  if (!status) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  let paid =
    status.paymentStatus === "succeeded" ||
    status.orderPaymentStatus === "succeeded" ||
    status.status === "paid";

  if (
    !paid
    && (status.paymentStatus === "requires_payment" || status.orderPaymentStatus === "requires_payment")
  ) {
    const payments = await fetchAdminRecordsByColumn("payments", "order_id", orderId, process.env, {
      skipPermissionCheck: true
    });
    const payment = payments.find((row) => !["failed", "cancelled", "refunded"].includes(String(row.status ?? "")))
      ?? payments[0];
    const provider = String(payment?.provider ?? "").trim().toLowerCase();
    const intentId = String(payment?.provider_intent_id ?? "").trim();

    if (payment && intentId && isPaymentProviderId(provider) && provider !== "stub") {
      try {
        const reconciled = await reconcilePaymentWithGateway({
          provider: provider as PaymentProviderId,
          intentId,
          expectedAmountInr: Number(payment.amount ?? status.total ?? 0),
          expectedCurrency: String(payment.currency ?? "INR"),
          maxAttempts: 1
        });

        if (hasSuccessfulGatewayPayment(reconciled)) {
          const result = await applyPaymentEvent({
            provider: provider as PaymentProviderId,
            event: reconciled!,
            source: "verify",
            eventId: `status-poll:${provider}:${reconciled!.paymentId ?? intentId}`
          });

          if (result.ok) {
            logPaymentEvent("payment_confirmed_via_status_poll", { orderId, provider });
            status = userId
              ? await fetchCheckoutOrderStatus(orderId, { userId })
              : await fetchCheckoutOrderStatus(orderId, { guestEmail });
            if (status) {
              paid =
                status.paymentStatus === "succeeded" ||
                status.orderPaymentStatus === "succeeded" ||
                status.status === "paid";
            } else {
              paid = true;
            }
          }
        } else if (isPendingGatewayPayment(reconciled)) {
          scheduleGatewayReconcileFollowUp({
            provider: provider as PaymentProviderId,
            intentId,
            expectedAmountInr: Number(payment.amount ?? status.total ?? 0),
            expectedCurrency: String(payment.currency ?? "INR")
          });
        }
      } catch (error) {
        logPaymentEvent("checkout_status_reconcile_skipped", {
          orderId,
          provider,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    orderId: status?.orderId ?? orderId,
    orderNumber: status?.orderNumber ?? orderId,
    total: status?.total ?? 0,
    status: status?.status ?? "",
    paymentStatus: status?.paymentStatus ?? "",
    orderPaymentStatus: status?.orderPaymentStatus ?? "",
    paid
  });
}
