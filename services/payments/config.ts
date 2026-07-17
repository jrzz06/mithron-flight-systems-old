import { isInternetDeployedEnvironment } from "@/lib/auth/deploy-environment";
import type { PaymentProviderId } from "./types";

export type EnvSource = Record<string, string | undefined>;

export function isRazorpayConfigured(env: EnvSource = process.env) {
  return Boolean(
    env.RAZORPAY_KEY_ID?.trim()
    && env.RAZORPAY_KEY_SECRET?.trim()
  );
}

export function isRazorpayProductionReady(env: EnvSource = process.env) {
  return isRazorpayConfigured(env) && Boolean(env.RAZORPAY_WEBHOOK_SECRET?.trim());
}

export function isCashfreeConfigured(env: EnvSource = process.env) {
  return Boolean(
    env.CASHFREE_APP_ID?.trim()
    && env.CASHFREE_SECRET_KEY?.trim()
  );
}

export function isCashfreeProductionReady(env: EnvSource = process.env) {
  return isCashfreeConfigured(env) && Boolean(env.CASHFREE_WEBHOOK_SECRET?.trim());
}

export function isStubPaymentAllowed(env: EnvSource = process.env) {
  return (env.PAYMENT_PROVIDER ?? "stub").toLowerCase() === "stub" && !isInternetDeployedEnvironment(env);
}

export function listEnabledPaymentProviders(env: EnvSource = process.env): PaymentProviderId[] {
  const providers: PaymentProviderId[] = [];
  if (isRazorpayConfigured(env)) providers.push("razorpay");
  if (isCashfreeConfigured(env)) providers.push("cashfree");
  if (!providers.length && isStubPaymentAllowed(env)) providers.push("stub");
  return providers;
}

export function isPaymentProviderId(value: string): value is PaymentProviderId {
  return value === "razorpay" || value === "cashfree" || value === "stripe" || value === "stub";
}

export function resolveCheckoutPaymentProvider(
  requested: string | undefined,
  env: EnvSource = process.env
): PaymentProviderId {
  const enabled = listEnabledPaymentProviders(env);
  const normalized = requested?.trim().toLowerCase();

  if (normalized && isPaymentProviderId(normalized) && enabled.includes(normalized)) {
    return normalized;
  }

  const configured = (env.PAYMENT_PROVIDER ?? "").trim().toLowerCase();
  if (configured && isPaymentProviderId(configured) && enabled.includes(configured)) {
    return configured;
  }

  if (enabled[0]) return enabled[0];
  if (isStubPaymentAllowed(env)) return "stub";
  throw new Error("No payment provider is configured.");
}

export function isPaymentGatewayConfigured(env: EnvSource = process.env) {
  if (listEnabledPaymentProviders(env).length > 0) return true;
  return isStubPaymentAllowed(env);
}

export function isPaymentGatewayProductionReady(env: EnvSource = process.env) {
  const enabled = listEnabledPaymentProviders(env).filter((provider) => provider !== "stub");
  if (!enabled.length) return false;

  return enabled.every((provider) => {
    if (provider === "razorpay") return isRazorpayProductionReady(env);
    if (provider === "cashfree") return isCashfreeProductionReady(env);
    return false;
  });
}

export function cashfreeApiBase(env: EnvSource = process.env) {
  const mode = (env.CASHFREE_ENV ?? "production").trim().toLowerCase();
  return mode === "sandbox" ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
}

export function cashfreeCheckoutMode(env: EnvSource = process.env): "sandbox" | "production" {
  const mode = (env.CASHFREE_ENV ?? "production").trim().toLowerCase();
  return mode === "sandbox" ? "sandbox" : "production";
}
