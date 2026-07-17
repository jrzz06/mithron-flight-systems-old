import { createHmac, timingSafeEqual } from "node:crypto";
import { inrAmountsMatch, inrToPaise } from "./amount";
import { logPaymentEvent, logPaymentWarning } from "./logger";
import {
  mapRazorpayPaymentEntityStatus,
  razorpayEnvCredentials,
  resolveVerifiedRazorpayPayment
} from "./razorpay-payment-resolution";
import type { PaymentEvent } from "./types";

type JsonRecord = Record<string, unknown>;

export type VerifyRazorpayServerInput = {
  internalOrderId: string;
  storedRazorpayOrderId: string;
  clientRazorpayOrderId?: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  expectedAmountInr: number;
  expectedCurrency: string;
};

function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string, keySecret: string) {
  const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(signature.trim(), "utf8");
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    throw new Error("Invalid Razorpay payment signature.");
  }
}

export async function verifyRazorpayPaymentOnServer(
  input: VerifyRazorpayServerInput,
  env: Record<string, string | undefined> = process.env
): Promise<PaymentEvent> {
  const { keySecret } = razorpayEnvCredentials(env);
  const razorpayOrderId = input.storedRazorpayOrderId.trim();
  const paymentId = input.razorpayPaymentId.trim();
  const signature = input.razorpaySignature.trim();

  if (!razorpayOrderId || !paymentId || !signature) {
    throw new Error("Razorpay payment verification payload is incomplete.");
  }

  if (input.clientRazorpayOrderId?.trim() && input.clientRazorpayOrderId.trim() !== razorpayOrderId) {
    logPaymentWarning("razorpay_order_id_client_mismatch", {
      orderId: input.internalOrderId,
      storedIntentId: razorpayOrderId,
      clientIntentId: input.clientRazorpayOrderId.trim()
    });
    throw new Error("Razorpay order does not match this checkout session.");
  }

  verifyRazorpaySignature(razorpayOrderId, paymentId, signature, keySecret);
  logPaymentEvent("razorpay_signature_verified", {
    orderId: input.internalOrderId,
    providerIntentId: razorpayOrderId,
    providerPaymentId: paymentId
  });

  const payment = await resolveVerifiedRazorpayPayment(paymentId, razorpayOrderId, env);
  const gatewayAmountInr = Number(payment.amount ?? 0) / 100;
  const gatewayCurrency = String(payment.currency ?? "INR").trim().toUpperCase();
  const expectedCurrency = input.expectedCurrency.trim().toUpperCase();

  if (gatewayCurrency !== expectedCurrency) {
    throw new Error("Payment currency mismatch.");
  }

  const expectedPaise = inrToPaise(input.expectedAmountInr);
  const gatewayPaise = inrToPaise(gatewayAmountInr);
  if (expectedPaise !== gatewayPaise && !inrAmountsMatch(input.expectedAmountInr, gatewayAmountInr)) {
    logPaymentWarning("razorpay_amount_mismatch", {
      orderId: input.internalOrderId,
      expected: input.expectedAmountInr,
      received: gatewayAmountInr
    });
    throw new Error("Payment amount mismatch.");
  }

  const status = mapRazorpayPaymentEntityStatus("", payment.status);
  logPaymentEvent("razorpay_gateway_status_resolved", {
    orderId: input.internalOrderId,
    providerPaymentId: paymentId,
    gatewayStatus: payment.status ?? "unknown",
    mappedStatus: status
  });

  return {
    provider: "razorpay",
    intentId: razorpayOrderId,
    paymentId: String(payment.id ?? paymentId),
    status,
    amount: gatewayAmountInr,
    currency: gatewayCurrency,
    raw: payment as JsonRecord
  };
}
