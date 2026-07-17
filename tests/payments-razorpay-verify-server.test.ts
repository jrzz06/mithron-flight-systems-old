import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyRazorpayPaymentOnServer } from "@/services/payments/verify-razorpay-server";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("server-side Razorpay verification", () => {
  it("rejects invalid signatures before calling Razorpay", async () => {
    await expect(
      verifyRazorpayPaymentOnServer({
        internalOrderId: "order-internal",
        storedRazorpayOrderId: "order_razorpay",
        razorpayPaymentId: "pay_test",
        razorpaySignature: "bad-signature",
        expectedAmountInr: 100,
        expectedCurrency: "INR"
      }, {
        RAZORPAY_KEY_ID: "rzp_test",
        RAZORPAY_KEY_SECRET: "secret"
      })
    ).rejects.toThrow(/signature/i);
  });

  it("rejects client razorpay order id mismatch", async () => {
    const secret = "api_secret";
    const razorpayOrderId = "order_stored";
    const paymentId = "pay_test";
    const signature = createHmac("sha256", secret).update(`${razorpayOrderId}|${paymentId}`).digest("hex");

    await expect(
      verifyRazorpayPaymentOnServer({
        internalOrderId: "order-internal",
        storedRazorpayOrderId: razorpayOrderId,
        clientRazorpayOrderId: "order_other",
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
        expectedAmountInr: 100,
        expectedCurrency: "INR"
      }, {
        RAZORPAY_KEY_ID: "rzp_test",
        RAZORPAY_KEY_SECRET: secret
      })
    ).rejects.toThrow(/does not match this checkout session/i);
  });

  it("routes payment confirmation through atomic RPC without payment-time stock deduction", () => {
    expect(source("services/payments/confirm-verified-payment.ts")).toContain("confirm_verified_payment");
    expect(source("services/payments/confirm-payment.ts")).toContain("confirmVerifiedPayment");
    expect(source("supabase/migrations/20260712000100_simplified_inventory_model.sql")).toContain("inventory_skipped");
  });

  it("verifies payments only through dedicated server module", () => {
    expect(source("app/api/payments/verify/route.ts")).toContain("verifyRazorpayPaymentOnServer");
    expect(source("app/api/payments/verify/route.ts")).not.toContain("getPaymentGateway");
  });
});
