import { isInternetDeployedEnvironment } from "@/lib/auth/deploy-environment";
import {
  isPaymentGatewayConfigured as isConfigured,
  isPaymentProviderId,
  listEnabledPaymentProviders,
  resolveCheckoutPaymentProvider
} from "./config";
import { createCashfreeGateway } from "./cashfree";
import { createRazorpayGateway } from "./razorpay";
import type { CreateIntentInput, PaymentGateway, PaymentProviderId } from "./types";

export { RazorpayGateway, createRazorpayGateway } from "./razorpay";
export { CashfreeGateway, createCashfreeGateway } from "./cashfree";
export {
  cashfreeApiBase,
  cashfreeCheckoutMode,
  isCashfreeConfigured,
  isCashfreeProductionReady,
  isPaymentGatewayProductionReady,
  isPaymentProviderId,
  isRazorpayConfigured,
  isRazorpayProductionReady,
  listEnabledPaymentProviders,
  resolveCheckoutPaymentProvider
} from "./config";

class StubPaymentGateway implements PaymentGateway {
  id = "stub" as const;

  async createIntent(input: CreateIntentInput) {
    return {
      intentId: `stub_intent_${input.orderId}`,
      checkoutUrl: `/checkout?order=${input.orderId}&stub=1`
    };
  }

  async verifyWebhook(payload: unknown) {
    const body = payload as Record<string, unknown>;
    return {
      provider: "stub" as const,
      intentId: String(body.intentId ?? ""),
      paymentId: String(body.paymentId ?? `stub_pay_${Date.now()}`),
      status: "succeeded" as const,
      amount: Number(body.amount ?? 0),
      currency: String(body.currency ?? "INR"),
      raw: payload
    };
  }

  async refund(intentId: string) {
    return { refundId: `stub_refund_${intentId}`, status: "succeeded" as const };
  }
}

class UnconfiguredGateway implements PaymentGateway {
  constructor(public id: PaymentProviderId) {}

  async createIntent(): Promise<never> {
    throw new Error("Online payments aren't available right now. Please try again later.");
  }

  async verifyWebhook(): Promise<never> {
    throw new Error("Online payments aren't available right now.");
  }

  async refund(): Promise<never> {
    throw new Error("Online payments aren't available right now.");
  }
}

export function isPaymentGatewayConfigured(env: Record<string, string | undefined> = process.env) {
  return isConfigured(env);
}

export function getPaymentGateway(
  provider?: PaymentProviderId,
  env: Record<string, string | undefined> = process.env
): PaymentGateway {
  const resolved = provider ?? resolveCheckoutPaymentProvider(undefined, env);

  if (resolved === "stub") {
    if (isInternetDeployedEnvironment(env)) {
      return new UnconfiguredGateway("stub");
    }
    return new StubPaymentGateway();
  }

  if (resolved === "razorpay") {
    if (!env.RAZORPAY_KEY_ID?.trim() || !env.RAZORPAY_KEY_SECRET?.trim()) {
      return new UnconfiguredGateway("razorpay");
    }
    return createRazorpayGateway(env);
  }

  if (resolved === "cashfree") {
    if (!env.CASHFREE_APP_ID?.trim() || !env.CASHFREE_SECRET_KEY?.trim()) {
      return new UnconfiguredGateway("cashfree");
    }
    return createCashfreeGateway(env);
  }

  return new UnconfiguredGateway(resolved);
}

export async function createPaymentIntent(
  input: CreateIntentInput,
  provider?: PaymentProviderId,
  env: Record<string, string | undefined> = process.env
) {
  const resolved = provider ?? resolveCheckoutPaymentProvider(undefined, env);
  return getPaymentGateway(resolved, env).createIntent(input);
}

export async function verifyPaymentWebhook(
  provider: PaymentProviderId,
  payload: unknown,
  signature: string,
  rawBody?: string,
  env: Record<string, string | undefined> = process.env
) {
  if (!isPaymentProviderId(provider)) {
    throw new Error("Unsupported payment provider.");
  }
  return getPaymentGateway(provider, env).verifyWebhook(payload, signature, rawBody);
}

async function verifyClientPayment(
  provider: PaymentProviderId,
  input: Parameters<NonNullable<PaymentGateway["verifyClientPayment"]>>[0],
  env: Record<string, string | undefined> = process.env
) {
  const gateway = getPaymentGateway(provider, env);
  if (!gateway.verifyClientPayment) {
    throw new Error(`${provider} does not support client payment verification.`);
  }
  return gateway.verifyClientPayment(input);
}

export function listPublicPaymentProviders(env: Record<string, string | undefined> = process.env) {
  return listEnabledPaymentProviders(env).filter((provider) => provider !== "stub");
}
