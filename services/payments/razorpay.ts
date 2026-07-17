import { createHmac, timingSafeEqual } from "node:crypto";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { assertMinimumCheckoutAmount, inrToPaise } from "./amount";
import {
  captureRazorpayPaymentIfAuthorized,
  fetchRazorpayOrderPayments,
  fetchRazorpayPaymentEntity,
  mapRazorpayPaymentEntityStatus,
  razorpayEnvCredentials,
  razorpayKeyMode,
  resolveVerifiedRazorpayPayment
} from "./razorpay-payment-resolution";
import { logPaymentError, logPaymentEvent } from "./logger";
import type {
  ClientPaymentVerificationInput,
  CreateIntentInput,
  PaymentEvent,
  PaymentGateway,
  PaymentIntentResult,
  RefundResult
} from "./types";

type RazorpayOrderResponse = {
  id: string;
  amount: number;
  currency: string;
  status: string;
};

type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        status?: string;
        method?: string;
      };
    };
    order?: {
      entity?: {
        id?: string;
        amount?: number;
        currency?: string;
        status?: string;
      };
    };
  };
};

function envWebhookSecret(env: Record<string, string | undefined>) {
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? "";
  if (!webhookSecret) {
    throw new Error("Razorpay webhook secret is not configured.");
  }
  return webhookSecret;
}

export class RazorpayGateway implements PaymentGateway {
  id = "razorpay" as const;
  private env: Record<string, string | undefined>;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.env = env;
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntentResult> {
    const { keyId, keySecret } = razorpayEnvCredentials(this.env);
    const normalizedAmount = assertMinimumCheckoutAmount(input.amount, "Razorpay");
    const amountPaise = inrToPaise(normalizedAmount);
    const receipt = (input.metadata?.receipt ?? input.orderId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const checkoutConfigId = this.env.RAZORPAY_CHECKOUT_CONFIG_ID?.trim();

    const orderBody: Record<string, unknown> = {
      amount: amountPaise,
      currency: input.currency || "INR",
      receipt: receipt || input.orderId.slice(0, 40),
      payment_capture: 1,
      notes: {
        order_id: input.orderId,
        customer_email: input.customerEmail,
        ...input.metadata
      }
    };
    if (checkoutConfigId) {
      orderBody.checkout_config_id = checkoutConfigId;
    }

    const response = await fetchWithTimeout("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(orderBody)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logPaymentError("razorpay_order_create_failed", new Error(`HTTP ${response.status}`), {
        orderId: input.orderId,
        amountPaise,
        currency: input.currency || "INR",
        keyMode: razorpayKeyMode(keyId),
        status: response.status,
        bodyPreview: body.slice(0, 240) || null
      });
      throw new Error(`Razorpay order creation failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
    }

    const order = (await response.json()) as RazorpayOrderResponse;
    logPaymentEvent("razorpay_order_created", {
      orderId: input.orderId,
      razorpayOrderId: order.id,
      amountPaise: order.amount,
      currency: order.currency,
      keyMode: razorpayKeyMode(keyId),
      receipt: receipt || input.orderId.slice(0, 40),
      checkoutConfigId: checkoutConfigId ?? null
    });
    return {
      intentId: order.id,
      providerOrderId: order.id,
      clientSecret: order.id,
      checkoutUrl: undefined,
      amountPaise: order.amount
    };
  }

  async verifyClientPayment(input: ClientPaymentVerificationInput): Promise<PaymentEvent> {
    const { keySecret } = razorpayEnvCredentials(this.env);
    const orderId = input.intentId.trim();
    const paymentId = input.paymentId?.trim() ?? "";
    const signature = input.signature?.trim() ?? "";
    if (!orderId || !paymentId || !signature) {
      throw new Error("Razorpay payment verification payload is incomplete.");
    }

    const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
    const expectedBuf = Buffer.from(expected, "utf8");
    const providedBuf = Buffer.from(signature, "utf8");
    if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
      throw new Error("Invalid Razorpay payment signature.");
    }

    const payment = await resolveVerifiedRazorpayPayment(paymentId, orderId, this.env);

    return {
      provider: "razorpay",
      intentId: orderId,
      paymentId: String(payment.id ?? paymentId),
      status: mapRazorpayPaymentEntityStatus("", payment.status),
      amount: Number(payment.amount ?? 0) / 100,
      currency: String(payment.currency ?? "INR"),
      raw: payment
    };
  }

  async fetchPaymentStatus(intentId: string): Promise<PaymentEvent> {
    const items = await fetchRazorpayOrderPayments(intentId, this.env);
    const payment = items[0];
    if (!payment) {
      return {
        provider: "razorpay",
        intentId,
        status: "requires_payment",
        amount: 0,
        currency: "INR",
        raw: { items }
      };
    }

    return {
      provider: "razorpay",
      intentId,
      paymentId: payment.id ? String(payment.id) : undefined,
      status: mapRazorpayPaymentEntityStatus("", payment.status),
      amount: Number(payment.amount ?? 0) / 100,
      currency: String(payment.currency ?? "INR"),
      raw: payment
    };
  }

  async verifyWebhook(payload: unknown, signature: string, rawBody?: string): Promise<PaymentEvent> {
    const webhookSecret = envWebhookSecret(this.env);
    const body = rawBody ?? JSON.stringify(payload);
    const expected = createHmac("sha256", webhookSecret).update(body).digest("hex");
    const provided = signature.replace(/^sha256=/, "").trim();

    const expectedBuf = Buffer.from(expected, "utf8");
    const providedBuf = Buffer.from(provided, "utf8");
    if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
      throw new Error("Invalid Razorpay webhook signature.");
    }

    const bodyJson = (typeof payload === "object" && payload !== null ? payload : JSON.parse(body)) as RazorpayWebhookPayload;
    const eventName = String(bodyJson.event ?? "");
    const payment = bodyJson.payload?.payment?.entity;
    const orderEntity = bodyJson.payload?.order?.entity;
    const intentId = String(payment?.order_id ?? orderEntity?.id ?? "");
    const paymentId = payment?.id ? String(payment.id) : undefined;
    const amount = Number(payment?.amount ?? orderEntity?.amount ?? 0) / 100;
    const currency = String(payment?.currency ?? orderEntity?.currency ?? "INR");
    const paymentStatus = payment?.status ?? orderEntity?.status;

    return {
      provider: "razorpay",
      intentId,
      paymentId,
      status: mapRazorpayPaymentEntityStatus(eventName, paymentStatus),
      amount,
      currency,
      raw: bodyJson
    };
  }

  async refund(intentId: string, amount?: number): Promise<RefundResult> {
    const { keyId, keySecret } = razorpayEnvCredentials(this.env);
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const response = await fetchWithTimeout(`https://api.razorpay.com/v1/payments/${encodeURIComponent(intentId)}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(amount ? { amount: inrToPaise(amount) } : {})
    });

    if (!response.ok) {
      throw new Error(`Razorpay refund failed (${response.status}).`);
    }

    const refund = (await response.json()) as { id?: string; status?: string };
    return {
      refundId: String(refund.id ?? `refund_${intentId}`),
      status: refund.status === "processed" ? "succeeded" : "pending"
    };
  }
}

export function createRazorpayGateway(env: Record<string, string | undefined> = process.env) {
  return new RazorpayGateway(env);
}

// Re-export for tests and reconciliation callers.
export {
  captureRazorpayPaymentIfAuthorized,
  fetchRazorpayPaymentEntity,
  mapRazorpayPaymentEntityStatus,
  resolveVerifiedRazorpayPayment
};
