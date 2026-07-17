import { createHmac, timingSafeEqual } from "node:crypto";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { getSiteOrigin } from "@/lib/site-url";
import { assertMinimumCheckoutAmount, inrToPaise, normalizeInrAmount } from "./amount";
import { cashfreeApiBase } from "./config";
import { logPaymentError } from "./logger";
import type {
  ClientPaymentVerificationInput,
  CreateIntentInput,
  PaymentEvent,
  PaymentGateway,
  PaymentIntentResult,
  RefundResult
} from "./types";

const API_VERSION = "2023-08-01";

type CashfreeOrderResponse = {
  order_id?: string;
  payment_session_id?: string;
  order_status?: string;
  order_amount?: number;
  order_currency?: string;
};

type CashfreeWebhookPayload = {
  type?: string;
  data?: {
    order?: {
      order_id?: string;
      order_amount?: number;
      order_currency?: string;
    };
    payment?: {
      cf_payment_id?: string | number;
      payment_status?: string;
      payment_amount?: number;
      payment_currency?: string;
    };
  };
};

function envApiCredentials(env: Record<string, string | undefined>) {
  const appId = env.CASHFREE_APP_ID?.trim() ?? "";
  const secretKey = env.CASHFREE_SECRET_KEY?.trim() ?? "";
  if (!appId || !secretKey) {
    throw new Error("Cashfree API credentials are not configured.");
  }
  return { appId, secretKey };
}

function envWebhookSecret(env: Record<string, string | undefined>) {
  const webhookSecret = env.CASHFREE_WEBHOOK_SECRET?.trim() ?? "";
  if (!webhookSecret) {
    throw new Error("Cashfree webhook secret is not configured.");
  }
  return webhookSecret;
}

function cashfreeHeaders(env: Record<string, string | undefined>) {
  const { appId, secretKey } = envApiCredentials(env);
  return {
    "x-client-id": appId,
    "x-client-secret": secretKey,
    "x-api-version": API_VERSION,
    "Content-Type": "application/json"
  };
}

function mapCashfreePaymentStatus(status: string | undefined): PaymentEvent["status"] {
  const normalized = String(status ?? "").toUpperCase();
  if (["SUCCESS", "PAID", "CAPTURED"].includes(normalized)) return "succeeded";
  if (["FAILED", "CANCELLED", "USER_DROPPED"].includes(normalized)) return "failed";
  if (["REFUNDED", "PARTIAL_REFUND"].includes(normalized)) return "refunded";
  if (["PENDING", "ACTIVE", "PROCESSING"].includes(normalized)) return "processing";
  return "requires_payment";
}

function mapCashfreeWebhookType(type: string | undefined, paymentStatus?: string) {
  const normalizedType = String(type ?? "").toUpperCase();
  if (normalizedType.includes("REFUND")) return "refunded" as const;
  if (normalizedType.includes("FAILED")) return "failed" as const;
  if (normalizedType.includes("SUCCESS")) return "succeeded" as const;
  return mapCashfreePaymentStatus(paymentStatus);
}

function sanitizeCashfreeOrderId(orderId: string) {
  return orderId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
}

export class CashfreeGateway implements PaymentGateway {
  id = "cashfree" as const;
  private env: Record<string, string | undefined>;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.env = env;
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntentResult> {
    const merchantOrderId = sanitizeCashfreeOrderId(input.metadata?.receipt?.trim() || input.orderId);
    const orderAmount = assertMinimumCheckoutAmount(input.amount, "Cashfree");
    const returnUrl = `${getSiteOrigin()}/checkout?cashfree_return=1&order=${encodeURIComponent(input.orderId)}`;

    const response = await fetchWithTimeout(`${cashfreeApiBase(this.env)}/orders`, {
      method: "POST",
      headers: cashfreeHeaders(this.env),
      body: JSON.stringify({
        order_id: merchantOrderId,
        order_amount: orderAmount,
        order_currency: input.currency || "INR",
        customer_details: {
          customer_id: merchantOrderId,
          customer_email: input.customerEmail,
          customer_phone: input.customerPhone?.replace(/\D/g, "").slice(-10) || "9999999999"
        },
        order_meta: {
          return_url: returnUrl,
          notify_url: `${getSiteOrigin()}/api/payments/webhooks/cashfree`
        },
        order_note: input.orderId
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logPaymentError("cashfree_order_create_failed", new Error(`HTTP ${response.status}`), {
        orderId: input.orderId,
        merchantOrderId,
        orderAmount,
        currency: input.currency || "INR",
        apiBase: cashfreeApiBase(this.env),
        status: response.status,
        bodyPreview: body.slice(0, 240) || null
      });
      throw new Error(`Cashfree order creation failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
    }

    const order = (await response.json()) as CashfreeOrderResponse;
    const paymentSessionId = String(order.payment_session_id ?? "");
    const intentId = String(order.order_id ?? merchantOrderId);
    if (!paymentSessionId) {
      throw new Error("Cashfree did not return a payment session id.");
    }

    return {
      intentId,
      providerOrderId: intentId,
      paymentSessionId,
      clientSecret: paymentSessionId,
      amountPaise: inrToPaise(orderAmount)
    };
  }

  async fetchPaymentStatus(intentId: string): Promise<PaymentEvent> {
    const response = await fetchWithTimeout(`${cashfreeApiBase(this.env)}/orders/${encodeURIComponent(intentId)}`, {
      method: "GET",
      headers: cashfreeHeaders(this.env),
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Cashfree order lookup failed (${response.status}).`);
    }

    const order = (await response.json()) as CashfreeOrderResponse;
    return {
      provider: "cashfree",
      intentId: String(order.order_id ?? intentId),
      status: mapCashfreePaymentStatus(order.order_status),
      amount: normalizeInrAmount(order.order_amount ?? 0),
      currency: String(order.order_currency ?? "INR"),
      raw: order
    };
  }

  async verifyClientPayment(input: ClientPaymentVerificationInput): Promise<PaymentEvent> {
    return this.fetchPaymentStatus(input.intentId);
  }

  async verifyWebhook(payload: unknown, signature: string, rawBody?: string): Promise<PaymentEvent> {
    const webhookSecret = envWebhookSecret(this.env);
    const body = rawBody ?? JSON.stringify(payload);
    const webhookTimestamp =
      typeof payload === "object"
      && payload !== null
      && "webhookTimestamp" in payload
      && typeof (payload as { webhookTimestamp?: string }).webhookTimestamp === "string"
        ? (payload as { webhookTimestamp: string }).webhookTimestamp
        : "";

    verifyCashfreeWebhookSignature({
      rawBody: body,
      signature: signature.trim(),
      timestamp: webhookTimestamp,
      webhookSecret
    });

    const bodyJson = (typeof payload === "object" && payload !== null ? payload : JSON.parse(body)) as CashfreeWebhookPayload;
    const order = bodyJson.data?.order;
    const payment = bodyJson.data?.payment;
    const intentId = String(order?.order_id ?? "");
    const paymentId = payment?.cf_payment_id ? String(payment.cf_payment_id) : undefined;
    const amount = normalizeInrAmount(payment?.payment_amount ?? order?.order_amount ?? 0);
    const currency = String(payment?.payment_currency ?? order?.order_currency ?? "INR");

    return {
      provider: "cashfree",
      intentId,
      paymentId,
      status: mapCashfreeWebhookType(bodyJson.type, payment?.payment_status),
      amount,
      currency,
      raw: bodyJson
    };
  }

  async refund(intentId: string, amount?: number): Promise<RefundResult> {
    const response = await fetchWithTimeout(`${cashfreeApiBase(this.env)}/orders/${encodeURIComponent(intentId)}/refunds`, {
      method: "POST",
      headers: cashfreeHeaders(this.env),
      body: JSON.stringify({
        refund_amount: amount ? Number(amount.toFixed(2)) : undefined,
        refund_id: `refund_${intentId}_${Date.now()}`,
        refund_note: "Customer refund"
      })
    });

    if (!response.ok) {
      throw new Error(`Cashfree refund failed (${response.status}).`);
    }

    const refund = (await response.json()) as { refund_id?: string; refund_status?: string };
    return {
      refundId: String(refund.refund_id ?? `refund_${intentId}`),
      status: refund.refund_status === "SUCCESS" ? "succeeded" : "pending"
    };
  }
}

export function createCashfreeGateway(env: Record<string, string | undefined> = process.env) {
  return new CashfreeGateway(env);
}

export function verifyCashfreeWebhookSignature(input: {
  rawBody: string;
  signature: string;
  timestamp: string;
  webhookSecret: string;
  maxAgeMs?: number;
}) {
  const maxAgeMs = input.maxAgeMs ?? 5 * 60_000;
  const timestampValue = Number(input.timestamp);
  if (!Number.isFinite(timestampValue)) {
    throw new Error("Invalid Cashfree webhook timestamp.");
  }
  const timestampMs = timestampValue > 1_000_000_000_000 ? timestampValue : timestampValue * 1000;
  if (Math.abs(Date.now() - timestampMs) > maxAgeMs) {
    throw new Error("Cashfree webhook timestamp is outside the acceptable window.");
  }

  const signedPayload = `${input.timestamp}${input.rawBody}`;
  const expected = createHmac("sha256", input.webhookSecret).update(signedPayload).digest("base64");
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(input.signature.trim(), "utf8");
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    throw new Error("Invalid Cashfree webhook signature.");
  }
}

async function safeFetchCashfreePaymentStatus(intentId: string, env: Record<string, string | undefined>) {
  try {
    return await createCashfreeGateway(env).fetchPaymentStatus(intentId);
  } catch (error) {
    logPaymentError("cashfree_status_fetch_failed", error, { intentId });
    throw error;
  }
}
