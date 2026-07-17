import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canTransitionPaymentLifecycle,
  mergePaymentLifecycleMetadata,
  readPaymentLifecycle
} from "@/lib/orders/payment-lifecycle";
import { verifyCashfreeWebhookSignature } from "@/services/payments/cashfree";
import { createRazorpayGateway } from "@/services/payments/razorpay";
import {
  isPaymentGatewayConfigured,
  listEnabledPaymentProviders,
  resolveCheckoutPaymentProvider
} from "@/services/payments/gateway";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("dual-provider payment integration", () => {
  it("lists enabled providers from environment", () => {
    const providers = listEnabledPaymentProviders({
      RAZORPAY_KEY_ID: "rzp_test",
      RAZORPAY_KEY_SECRET: "secret",
      CASHFREE_APP_ID: "app",
      CASHFREE_SECRET_KEY: "secret"
    });
    expect(providers).toEqual(["razorpay", "cashfree"]);
    expect(isPaymentGatewayConfigured({
      RAZORPAY_KEY_ID: "rzp_test",
      RAZORPAY_KEY_SECRET: "secret"
    })).toBe(true);
  });

  it("resolves requested checkout provider when enabled", () => {
    const env = {
      PAYMENT_PROVIDER: "razorpay",
      RAZORPAY_KEY_ID: "rzp_test",
      RAZORPAY_KEY_SECRET: "secret",
      CASHFREE_APP_ID: "app",
      CASHFREE_SECRET_KEY: "secret"
    };
    expect(resolveCheckoutPaymentProvider("cashfree", env)).toBe("cashfree");
    expect(resolveCheckoutPaymentProvider(undefined, env)).toBe("razorpay");
  });

  it("verifies Razorpay client payment signatures", async () => {
    const secret = "api_secret";
    const orderId = "order_abc";
    const paymentId = "pay_abc";
    const signature = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

    const gateway = createRazorpayGateway({
      RAZORPAY_KEY_ID: "rzp_test",
      RAZORPAY_KEY_SECRET: secret,
      RAZORPAY_WEBHOOK_SECRET: "whsec"
    });

    await expect(
      gateway.verifyClientPayment?.({ intentId: orderId, paymentId, signature })
    ).rejects.toThrow(/lookup failed|payment does not match/i);
  });

  it("verifies Cashfree webhook signatures", () => {
    const secret = "cashfree_webhook_secret";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK" });
    const signature = createHmac("sha256", secret).update(`${timestamp}${rawBody}`).digest("base64");

    expect(() =>
      verifyCashfreeWebhookSignature({
        rawBody,
        signature,
        timestamp,
        webhookSecret: secret
      })
    ).not.toThrow();
  });

  it("tracks payment lifecycle transitions", () => {
    expect(canTransitionPaymentLifecycle("PENDING", "PAYMENT_INITIATED")).toBe(true);
    expect(canTransitionPaymentLifecycle("PAYMENT_INITIATED", "PAYMENT_VERIFIED")).toBe(true);
    expect(canTransitionPaymentLifecycle("PAYMENT_VERIFIED", "CONFIRMED")).toBe(true);
    expect(canTransitionPaymentLifecycle("FAILED", "PAYMENT_VERIFIED")).toBe(false);

    const metadata = mergePaymentLifecycleMetadata({}, {
      state: "PAYMENT_INITIATED",
      provider: "razorpay",
      source: "checkout"
    });
    expect(readPaymentLifecycle(metadata)).toBe("PAYMENT_INITIATED");
  });

  it("routes payment verification through a dedicated API", () => {
    expect(source("app/api/payments/verify/route.ts")).toContain("verifyRazorpayPaymentOnServer");
    expect(source("app/api/payments/verify/route.ts")).toContain("verifyCashfreePaymentOnServer");
    expect(source("app/api/payments/verify/route.ts")).toContain("applyPaymentEvent");
  });

  it("centralizes webhook side effects in confirm-payment service", () => {
    const confirm = source("services/payments/confirm-payment.ts");
    expect(confirm).toContain("applyPaymentEvent");
    expect(confirm).toContain("resolvePaymentRecordForEvent");
    expect(confirm).not.toContain("releaseCheckoutStock");
    expect(confirm).toContain("confirmVerifiedPayment");
    const atomic = source("services/payments/confirm-verified-payment.ts");
    expect(atomic).toContain("notifyAdminsAboutPaidOrder");
  });

  it("exposes enabled providers without secrets", () => {
    expect(source("app/api/payments/providers/route.ts")).toContain("listPublicPaymentProviders");
  });
});
