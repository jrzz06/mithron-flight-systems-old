import { describe, expect, it } from "vitest";
import { canTransitionOrderStatus, transitionOrderStatus } from "@/services/orders";
import { getPaymentGateway } from "@/services/payments/gateway";

describe("payments flow", () => {
  const stubEnv = { PAYMENT_PROVIDER: "stub", NODE_ENV: "development" };

  it("uses stub gateway by default", async () => {
    const gateway = getPaymentGateway("stub", stubEnv);
    const intent = await gateway.createIntent({
      orderId: "order-1",
      amount: 1200,
      currency: "INR",
      customerEmail: "buyer@example.com"
    });
    expect(intent.intentId).toContain("stub_intent_order-1");
  });

  it("guards order status transitions around payment success", () => {
    expect(canTransitionOrderStatus("pending_payment", "paid")).toBe(true);
    expect(canTransitionOrderStatus("paid", "admin_review")).toBe(true);
    expect(() => transitionOrderStatus("pending_payment", "confirmed")).toThrow();
  });

  it("verifies stub webhook events", async () => {
    const gateway = getPaymentGateway("stub", stubEnv);
    const event = await gateway.verifyWebhook({ intentId: "stub_intent_1", amount: 100, currency: "INR" }, "stub");
    expect(event.status).toBe("succeeded");
  });
});
