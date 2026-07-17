import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { inrAmountsMatch } from "./amount";
import type { PaymentEvent } from "./types";

export type RazorpayPaymentEntity = {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  method?: string;
  captured?: boolean;
};

export function razorpayKeyMode(keyId: string): "test" | "live" | "unknown" {
  const normalized = keyId.trim().toLowerCase();
  if (normalized.startsWith("rzp_test_")) return "test";
  if (normalized.startsWith("rzp_live_")) return "live";
  return "unknown";
}

export function razorpayEnvCredentials(env: Record<string, string | undefined>) {
  const keyId = env.RAZORPAY_KEY_ID?.trim() ?? "";
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  if (!keyId || !keySecret) {
    throw new Error("Razorpay API credentials are not configured.");
  }
  return { keyId, keySecret };
}

export function mapRazorpayPaymentEntityStatus(
  eventName: string,
  paymentStatus?: string
): PaymentEvent["status"] {
  if (eventName === "payment.failed" || paymentStatus === "failed") return "failed";
  if (eventName === "payment.refunded" || eventName === "refund.processed" || paymentStatus === "refunded") {
    return "refunded";
  }
  if (
    eventName === "payment.captured"
    || eventName === "payment.authorized"
    || eventName === "order.paid"
    || eventName === "qr_code.credited"
    || paymentStatus === "captured"
    || paymentStatus === "paid"
    || paymentStatus === "authorized"
    || paymentStatus === "credited"
  ) {
    return "succeeded";
  }
  return "requires_payment";
}

export async function fetchRazorpayPaymentEntity(
  paymentId: string,
  env: Record<string, string | undefined>
): Promise<RazorpayPaymentEntity> {
  const { keyId, keySecret } = razorpayEnvCredentials(env);
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetchWithTimeout(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Razorpay payment lookup failed (${response.status}).`);
  }

  return (await response.json()) as RazorpayPaymentEntity;
}

export async function fetchRazorpayOrderPayments(
  razorpayOrderId: string,
  env: Record<string, string | undefined>
) {
  const { keyId, keySecret } = razorpayEnvCredentials(env);
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetchWithTimeout(
    `https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}/payments`,
    {
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`Razorpay order lookup failed (${response.status}).`);
  }

  const body = (await response.json()) as { items?: RazorpayPaymentEntity[] };
  return body.items ?? [];
}

export async function captureRazorpayPaymentIfAuthorized(
  payment: RazorpayPaymentEntity,
  env: Record<string, string | undefined>
) {
  if (payment.status !== "authorized") return payment;

  const paymentId = String(payment.id ?? "");
  const amountPaise = Number(payment.amount ?? 0);
  if (!paymentId || !amountPaise) return payment;

  const { keyId, keySecret } = razorpayEnvCredentials(env);
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetchWithTimeout(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ amount: amountPaise, currency: String(payment.currency ?? "INR") })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (!/already captured|captured/i.test(body)) {
      return payment;
    }
  }

  return fetchRazorpayPaymentEntity(paymentId, env);
}

function isTerminalRazorpayStatus(status: string) {
  return ["captured", "paid", "authorized", "failed", "refunded"].includes(status);
}

function pickBestRazorpayPayment(items: RazorpayPaymentEntity[]) {
  const successStatuses = new Set(["captured", "paid", "authorized"]);
  const succeeded = items.filter((item) => successStatuses.has(String(item.status ?? "")));
  if (succeeded.length) {
    const captured = succeeded.find((item) => String(item.status ?? "") === "captured");
    return captured ?? succeeded[0];
  }
  return items[0] ?? null;
}

/**
 * One gateway fetch (+ optional capture) per invocation. Remaining settle work is handled by
 * follow-up reconcile jobs / client status polls instead of synchronous 10–15× loops.
 */
export async function resolveVerifiedRazorpayPayment(
  paymentId: string,
  razorpayOrderId: string,
  env: Record<string, string | undefined>,
  options?: { maxAttempts?: number; delayMs?: number }
) {
  void options?.maxAttempts;
  void options?.delayMs;

  let payment = await fetchRazorpayPaymentEntity(paymentId, env);
  if (String(payment.order_id ?? "") !== razorpayOrderId) {
    throw new Error("Razorpay payment does not match the checkout order.");
  }

  payment = await captureRazorpayPaymentIfAuthorized(payment, env);

  const status = String(payment.status ?? "").toLowerCase();
  if (!isTerminalRazorpayStatus(status)) {
    // Single re-fetch after capture is enough for this invocation.
    payment = await fetchRazorpayPaymentEntity(paymentId, env);
    if (String(payment.order_id ?? "") !== razorpayOrderId) {
      throw new Error("Razorpay payment does not match the checkout order.");
    }
  }

  return payment;
}

export async function reconcileRazorpayOrderPayment(
  razorpayOrderId: string,
  env: Record<string, string | undefined>,
  options?: { expectedAmountInr?: number; expectedCurrency?: string; maxAttempts?: number; delayMs?: number }
): Promise<PaymentEvent | null> {
  void options?.maxAttempts;
  void options?.delayMs;
  const expectedCurrency = (options?.expectedCurrency ?? "INR").trim().toUpperCase();

  const items = await fetchRazorpayOrderPayments(razorpayOrderId, env);
  const candidate = pickBestRazorpayPayment(items);
  if (candidate?.id) {
    const payment = await resolveVerifiedRazorpayPayment(
      String(candidate.id),
      razorpayOrderId,
      env
    );
    const status = mapRazorpayPaymentEntityStatus("", payment.status);
    const amount = Number(payment.amount ?? 0) / 100;
    const currency = String(payment.currency ?? "INR").trim().toUpperCase();

    if (currency !== expectedCurrency) {
      return null;
    }
    if (
      options?.expectedAmountInr !== undefined
      && !inrAmountsMatch(options.expectedAmountInr, amount)
      && status === "succeeded"
    ) {
      return null;
    }

    if (status === "succeeded" || status === "failed" || status === "refunded") {
      return {
        provider: "razorpay",
        intentId: razorpayOrderId,
        paymentId: String(payment.id ?? candidate.id),
        status,
        amount,
        currency,
        raw: payment
      };
    }

    return {
      provider: "razorpay",
      intentId: razorpayOrderId,
      paymentId: String(payment.id ?? candidate.id),
      status: status === "processing" ? "processing" : "requires_payment",
      amount,
      currency,
      raw: payment
    };
  }

  if (!candidate) {
    return {
      provider: "razorpay",
      intentId: razorpayOrderId,
      status: "requires_payment",
      amount: 0,
      currency: expectedCurrency,
      raw: { items }
    };
  }

  const status = mapRazorpayPaymentEntityStatus("", candidate.status);
  return {
    provider: "razorpay",
    intentId: razorpayOrderId,
    paymentId: candidate.id ? String(candidate.id) : undefined,
    status: status === "succeeded" ? status : "requires_payment",
    amount: Number(candidate.amount ?? 0) / 100,
    currency: String(candidate.currency ?? expectedCurrency).trim().toUpperCase(),
    raw: candidate
  };
}
