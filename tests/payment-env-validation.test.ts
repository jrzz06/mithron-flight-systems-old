import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyCashfreeWebhookSignature } from "@/services/payments/cashfree";
import { collectPaymentEnvironmentIssues } from "@/services/payments/env-validation";
import { createRazorpayGateway } from "@/services/payments/razorpay";

describe("payment environment validation", () => {
  it("flags missing webhook secrets when providers are configured", () => {
    const issues = collectPaymentEnvironmentIssues({
      NODE_ENV: "development",
      RAZORPAY_KEY_ID: "rzp_test_abc",
      RAZORPAY_KEY_SECRET: "secret",
      CASHFREE_APP_ID: "app",
      CASHFREE_SECRET_KEY: "secret"
    });

    expect(issues.some((issue) => issue.code === "razorpay_webhook_secret_missing")).toBe(true);
    expect(issues.some((issue) => issue.code === "cashfree_webhook_secret_missing")).toBe(true);
  });

  it("rejects live Razorpay keys in development without override", () => {
    const issues = collectPaymentEnvironmentIssues({
      NODE_ENV: "development",
      RAZORPAY_KEY_ID: "rzp_live_abc",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAY_WEBHOOK_SECRET: "whsec"
    });

    expect(issues.some((issue) => issue.code === "razorpay_live_keys_in_development")).toBe(true);
  });

  it("allows live Razorpay keys in development when explicitly opted in", () => {
    const issues = collectPaymentEnvironmentIssues({
      NODE_ENV: "development",
      PAYMENT_ALLOW_LIVE_IN_DEV: "true",
      RAZORPAY_KEY_ID: "rzp_live_abc",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAY_WEBHOOK_SECRET: "whsec"
    });

    expect(issues.some((issue) => issue.code === "razorpay_live_keys_in_development")).toBe(false);
  });

  it("rejects test Razorpay keys in production", () => {
    const issues = collectPaymentEnvironmentIssues({
      NODE_ENV: "production",
      RAZORPAY_KEY_ID: "rzp_test_abc",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAY_WEBHOOK_SECRET: "whsec"
    });

    expect(issues.some((issue) => issue.code === "razorpay_test_keys_in_production")).toBe(true);
  });

  it("detects swapped Razorpay key id and secret", () => {
    const issues = collectPaymentEnvironmentIssues({
      NODE_ENV: "development",
      RAZORPAY_KEY_ID: "rzp_test_abc",
      RAZORPAY_KEY_SECRET: "rzp_test_wrong",
      RAZORPAY_WEBHOOK_SECRET: "whsec"
    });

    expect(issues.some((issue) => issue.code === "razorpay_secret_looks_like_key_id")).toBe(true);
  });
});

describe("payment webhook signature verification", () => {
  it("accepts valid Razorpay webhook signatures and rejects tampered ones", async () => {
    const secret = "razorpay_whsec_test";
    const payload = {
      event: "qr_code.credited",
      payload: {
        payment: {
          entity: {
            id: "pay_qr",
            order_id: "order_qr",
            amount: 10000,
            currency: "INR",
            status: "captured"
          }
        }
      }
    };
    const rawBody = JSON.stringify(payload);
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
    const gateway = createRazorpayGateway({
      RAZORPAY_KEY_ID: "rzp_test",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAY_WEBHOOK_SECRET: secret
    });

    const event = await gateway.verifyWebhook(payload, signature, rawBody);
    expect(event.status).toBe("succeeded");

    await expect(gateway.verifyWebhook(payload, "deadbeef", rawBody)).rejects.toThrow(/signature/i);
  });

  it("accepts valid Cashfree webhook signatures and rejects tampered ones", () => {
    const secret = "cashfree_whsec_test";
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

    expect(() =>
      verifyCashfreeWebhookSignature({
        rawBody,
        signature: "invalid",
        timestamp,
        webhookSecret: secret
      })
    ).toThrow(/signature/i);
  });
});
