import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { isInternetDeployedEnvironment } from "@/lib/auth/deploy-environment";
import { applyPaymentEvent } from "@/services/payments/confirm-payment";
import { isPaymentProviderId, verifyPaymentWebhook } from "@/services/payments/gateway";
import { logPaymentError } from "@/services/payments/logger";
import type { PaymentProviderId } from "@/services/payments/types";

function resolveWebhookEventId(
  provider: string,
  request: Request,
  payload: unknown,
  event: { intentId: string; status: string; paymentId?: string }
) {
  if (provider === "razorpay") {
    const headerId = request.headers.get("x-razorpay-event-id")?.trim();
    if (headerId) return headerId;
  }

  if (provider === "cashfree") {
    const headerId =
      request.headers.get("x-idempotency-key")?.trim()
      ?? request.headers.get("x-idempotency-header")?.trim();
    if (headerId) return headerId;
  }

  const payloadRecord = payload as { id?: string };
  if (payloadRecord.id) {
    return String(payloadRecord.id);
  }

  return `${provider}:${event.intentId}:${event.status}:${event.paymentId ?? "unknown"}`;
}

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: providerParam } = await context.params;
  const provider = providerParam.trim().toLowerCase();

  const rateKey = `${provider}:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous"}`;
  const limit = await checkDistributedRateLimit(`payments-webhook:${rateKey}`, 120, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  if (provider === "stub") {
    if (isInternetDeployedEnvironment()) {
      return NextResponse.json({ error: "Stub payment webhooks are disabled on deployed environments." }, { status: 403 });
    }
  } else if (!isPaymentProviderId(provider) || provider === "stripe") {
    return NextResponse.json({ error: "Unsupported payment provider." }, { status: 404 });
  }

  const rawBody = await request.text();
  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  let signature = "";
  let webhookPayload: unknown = payload;

  if (provider === "razorpay") {
    signature = request.headers.get("x-razorpay-signature") ?? "";
    if (!signature) {
      return NextResponse.json({ error: "Missing Razorpay signature." }, { status: 401 });
    }
  } else if (provider === "cashfree") {
    signature = request.headers.get("x-webhook-signature") ?? "";
    const timestamp = request.headers.get("x-webhook-timestamp") ?? "";
    if (!signature || !timestamp) {
      return NextResponse.json({ error: "Missing Cashfree webhook signature headers." }, { status: 401 });
    }
    webhookPayload = { ...(payload as Record<string, unknown>), webhookTimestamp: timestamp };
  }

  let event;
  try {
    event = await verifyPaymentWebhook(
      provider as PaymentProviderId,
      webhookPayload,
      signature,
      rawBody
    );
  } catch (error) {
    logPaymentError("webhook_verification_failed", error, { provider });
    const message = error instanceof Error ? error.message : "Webhook verification failed.";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const eventId = resolveWebhookEventId(provider, request, payload, event);

  const result = await applyPaymentEvent({
    provider: provider as PaymentProviderId,
    event,
    source: "webhook",
    eventId,
    rawPayload: payload
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status ?? 500 });
  }

  return NextResponse.json({
    ok: true,
    provider,
    status: result.status,
    ...(result.skipped ? { skipped: true, reason: result.reason } : {})
  });
}
