import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRazorpayGateway } from "@/services/payments/razorpay";
import { razorpayKeyMode } from "@/services/payments/razorpay-payment-resolution";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Razorpay payment gateway", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("detects razorpay key mode from key id prefix", () => {
    expect(razorpayKeyMode("rzp_test_abc")).toBe("test");
    expect(razorpayKeyMode("rzp_live_abc")).toBe("live");
    expect(razorpayKeyMode("unknown")).toBe("unknown");
  });

  it("creates orders with checkout_config_id when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "order_cfg", amount: 10000, currency: "INR", status: "created" })
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = createRazorpayGateway({
      RAZORPAY_KEY_ID: "rzp_test_key",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAY_WEBHOOK_SECRET: "whsec",
      RAZORPAY_CHECKOUT_CONFIG_ID: "config_test123"
    });

    const result = await gateway.createIntent({
      orderId: "internal-order-1",
      amount: 100,
      currency: "INR",
      customerEmail: "buyer@example.com",
      metadata: { receipt: "ORD-123" }
    });

    expect(result.intentId).toBe("order_cfg");
    expect(result.amountPaise).toBe(10000);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body.checkout_config_id).toBe("config_test123");
    expect(body.amount).toBe(10000);
    expect(body.currency).toBe("INR");
    expect(body.payment_capture).toBe(1);
  });

  it("verifies webhook HMAC signatures", async () => {
    const secret = "test_webhook_secret";
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_test",
            order_id: "order_test",
            amount: 50000,
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
    expect(event.intentId).toBe("order_test");
    expect(event.amount).toBe(500);
  });

  it("rejects invalid signatures", async () => {
    const gateway = createRazorpayGateway({
      RAZORPAY_KEY_ID: "rzp_test",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAY_WEBHOOK_SECRET: "test_webhook_secret"
    });
    await expect(gateway.verifyWebhook({}, "bad-signature", "{}")).rejects.toThrow(/signature/i);
  });

  it("rejects sub-rupee order totals before calling Razorpay", async () => {
    const gateway = createRazorpayGateway({
      RAZORPAY_KEY_ID: "rzp_test",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAY_WEBHOOK_SECRET: "test_webhook_secret"
    });
    await expect(
      gateway.createIntent({
        orderId: "order-1",
        amount: 0.5,
        currency: "INR",
        customerEmail: "buyer@example.com"
      })
    ).rejects.toThrow(/at least ₹1/i);
  });

  it("treats authorized Razorpay payments as succeeded after client verification", async () => {
    const secret = "test_webhook_secret";
    const payload = {
      event: "payment.authorized",
      payload: {
        payment: {
          entity: {
            id: "pay_auth",
            order_id: "order_auth",
            amount: 11800,
            currency: "INR",
            status: "authorized"
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
    expect(event.amount).toBe(118);
  });

  it("maps order.paid webhook events to succeeded", async () => {
    const secret = "test_webhook_secret";
    const payload = {
      event: "order.paid",
      payload: {
        order: {
          entity: {
            id: "order_paid",
            amount: 50000,
            currency: "INR",
            status: "paid"
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
    expect(event.intentId).toBe("order_paid");
  });
});

describe("commerce lifecycle hardening", () => {
  it("routes warehouse fulfillment through deduct_order_inventory_on_fulfillment", () => {
    const movements = source("services/warehouse-movements.ts");
    expect(movements).toContain("deductInventoryForOrder");
  });

  it("does not deduct stock during shipment creation", () => {
    const shipments = source("services/shipments.ts");
    expect(shipments).not.toContain("fulfillReservedStock");
    expect(shipments).not.toContain("orderHasCheckoutReservations");
  });

  it("does not release stock on payment webhook failure", () => {
    const confirm = source("services/payments/confirm-payment.ts");
    expect(confirm).toContain('event.status === "failed"');
    expect(confirm).not.toContain("releaseCheckoutStock");
  });

  it("handles payment refunds with order status update only", () => {
    const confirm = source("services/payments/confirm-payment.ts");
    expect(confirm).toContain('event.status === "refunded"');
    expect(confirm).not.toContain("releaseCheckoutStock");
  });

  it("defines simplified inventory migration with fulfillment deduction", () => {
    const migration = source("supabase/migrations/20260712000100_simplified_inventory_model.sql");
    expect(migration).toContain("deduct_order_inventory_on_fulfillment");
    expect(migration).toContain("inventory_skipped");
  });
});
