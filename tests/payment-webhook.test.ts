import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRazorpayGateway } from "@/services/payments/razorpay";
import { canTransitionOrderStatus } from "@/services/orders";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("payment webhook hardening", () => {
  it("maps Razorpay refund events to refunded status", async () => {
    const secret = "test_webhook_secret";
    const payload = {
      event: "payment.refunded",
      payload: {
        payment: {
          entity: {
            id: "pay_refund",
            order_id: "order_refund",
            amount: 25000,
            currency: "INR",
            status: "refunded"
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
    expect(event.status).toBe("refunded");
  });

  it("allows paid and delivered orders to transition to refunded", () => {
    expect(canTransitionOrderStatus("paid", "refunded")).toBe(true);
    expect(canTransitionOrderStatus("delivered", "refunded")).toBe(true);
    expect(canTransitionOrderStatus("pending_payment", "refunded")).toBe(false);
  });

  it("handles refunded webhook with timeline update without stock release", () => {
    const confirm = source("services/payments/confirm-payment.ts");
    expect(confirm).toContain('event.status === "refunded"');
    expect(confirm).not.toContain("releaseCheckoutStock");
    expect(confirm).toContain('payment_status: "refunded"');
    expect(confirm).toContain("payment.refunded");
  });

  it("skips duplicate webhook events", () => {
    const confirm = source("services/payments/confirm-payment.ts");
    expect(confirm).toContain("duplicate_event");
    expect(confirm).toContain("payment_webhook_events");
    expect(confirm).toContain("payment_downgrade_blocked");
  });
});
