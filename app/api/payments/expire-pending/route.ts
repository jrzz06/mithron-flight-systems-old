import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron-lock";
import { authorizeBearerSecret, type BearerAuthResult } from "@/lib/api/bearer-auth";
import { getSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { mergePaymentLifecycleMetadata } from "@/lib/orders/payment-lifecycle";
import { updateAdminRecord } from "@/services/admin-actions";
import { releaseCheckoutStock } from "@/services/checkout-stock";
import { applyPaymentEvent } from "@/services/payments/confirm-payment";
import {
  hasSuccessfulGatewayPayment,
  isPendingGatewayPayment,
  reconcilePaymentWithGateway,
  scheduleGatewayReconcileFollowUp
} from "@/services/payments/reconcile-gateway-payment";
import { logPaymentEvent } from "@/services/payments/logger";
import type { PaymentProviderId } from "@/services/payments/types";

const PENDING_MAX_MINUTES = 30;

type ExpirePendingOrderRow = {
  id?: string;
  metadata?: Record<string, unknown>;
  total?: number;
  currency?: string;
  payments?: Array<{
    id?: string;
    provider?: string;
    provider_intent_id?: string;
    amount?: number;
    currency?: string;
    status?: string;
  }> | null;
};

function bearerAuthResponse(auth: BearerAuthResult) {
  if (auth === "rate_limited") {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  if (auth === "misconfigured") {
    return NextResponse.json({ error: "Payment expire secret is not configured." }, { status: 503 });
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}

async function handleExpirePending(request: Request, secret: string | undefined) {
  const auth = await authorizeBearerSecret(request, secret);
  const denied = bearerAuthResponse(auth);
  if (denied) return denied;

  const locked = await withCronLock("lock:expire-pending-payments", 60, async () => {
    return runExpirePendingPayments();
  });
  return locked instanceof NextResponse ? locked : NextResponse.json(locked);
}

/** Vercel cron invokes this path with GET and the CRON_SECRET bearer header. */
export async function GET(request: Request) {
  return handleExpirePending(request, process.env.CRON_SECRET);
}

/** Manual/scripted triggers keep the dedicated payment expire secret. */
export async function POST(request: Request) {
  return handleExpirePending(request, process.env.PAYMENT_EXPIRE_SECRET);
}

async function runExpirePendingPayments() {
  const config = getSupabaseAdminConfig(process.env);
  if (!config.configured) {
    return NextResponse.json(
      { ok: false, error: "Payment expire unavailable.", retryable: true },
      { status: 503 }
    );
  }
  const cutoff = new Date(Date.now() - PENDING_MAX_MINUTES * 60_000).toISOString();
  // Join payments in one query instead of N+1 per-order fetches.
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/orders?select=id,status,payment_status,metadata,total,currency,payments(id,provider,provider_intent_id,amount,currency,status)&status=eq.pending_payment&payment_status=eq.requires_payment&created_at=lt.${encodeURIComponent(cutoff)}&limit=100`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return NextResponse.json(
      { ok: false, error: "Failed to load stale orders.", retryable: true },
      { status: 503 }
    );
  }

  const rows = (await response.json()) as ExpirePendingOrderRow[];
  let released = 0;
  let deferred = 0;
  let recovered = 0;

  for (const row of rows) {
    const orderId = String(row.id ?? "");
    if (!orderId) continue;

    const hold = row.metadata && typeof row.metadata === "object"
      ? String((row.metadata as Record<string, unknown>).payment_hold ?? "")
      : "";
    if (hold === "manual_admin") continue;

    try {
      const payments = Array.isArray(row.payments) ? row.payments : [];
      const payment = payments.find((item) => String(item.status ?? "") !== "refunded") ?? payments[0];
      const provider = String(payment?.provider ?? "") as PaymentProviderId;
      const intentId = String(payment?.provider_intent_id ?? "");

      if (payment && intentId && (provider === "razorpay" || provider === "cashfree")) {
        const reconciled = await reconcilePaymentWithGateway({
          provider,
          intentId,
          expectedAmountInr: Number(payment.amount ?? row.total ?? 0),
          expectedCurrency: String(payment.currency ?? row.currency ?? "INR"),
          maxAttempts: 1
        });

        if (hasSuccessfulGatewayPayment(reconciled)) {
          const result = await applyPaymentEvent({
            provider,
            event: reconciled!,
            source: "webhook",
            eventId: `expire-recover:${provider}:${reconciled!.paymentId ?? intentId}`
          });
          if (result.ok) {
            recovered += 1;
            logPaymentEvent("payment_expire_recovered", { orderId, provider, intentId });
            continue;
          }
        }

        if (isPendingGatewayPayment(reconciled)) {
          deferred += 1;
          scheduleGatewayReconcileFollowUp({
            provider,
            intentId,
            expectedAmountInr: Number(payment.amount ?? row.total ?? 0),
            expectedCurrency: String(payment.currency ?? row.currency ?? "INR")
          });
          logPaymentEvent("payment_expire_deferred", { orderId, provider, intentId });
          continue;
        }
      }

      for (const paymentRow of payments) {
        if (["succeeded", "failed", "refunded"].includes(String(paymentRow.status ?? ""))) continue;
        await updateAdminRecord(
          "payments",
          "id",
          String(paymentRow.id),
          {
            status: "failed",
            updated_at: new Date().toISOString()
          },
          null,
          process.env,
          { allowSystemActor: true }
        );
      }

      const metadata = mergePaymentLifecycleMetadata(row.metadata ?? {}, {
        state: "EXPIRED",
        source: "expire",
        note: "Payment session expired before completion."
      });

      await updateAdminRecord(
        "orders",
        "id",
        orderId,
        {
          status: "cancelled",
          payment_status: "failed",
          metadata: {
            ...metadata,
            cancellation_reason: "payment_expired"
          },
          updated_at: new Date().toISOString()
        },
        null,
        process.env,
        { allowSystemActor: true }
      );
      await releaseCheckoutStock(orderId).catch((error) => {
        console.error("[payments/expire-pending] stock release failed", orderId, error);
      });
      released += 1;
      logPaymentEvent("payment_expired_after_reconcile", { orderId });
    } catch (error) {
      console.error("[payments/expire-pending] failed for order", orderId, error);
    }
  }

  return { ok: true, released, deferred, recovered, scanned: rows.length };
}
