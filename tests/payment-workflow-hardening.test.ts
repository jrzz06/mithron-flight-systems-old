import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hasSuccessfulGatewayPayment,
  isPendingGatewayPayment
} from "@/services/payments/reconcile-gateway-payment";
import { mapRazorpayPaymentEntityStatus } from "@/services/payments/razorpay-payment-resolution";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("payment workflow hardening", () => {
  it("blocks payment downgrades after terminal paid state", () => {
    const confirm = source("services/payments/confirm-payment.ts");
    expect(confirm).toContain("payment_downgrade_blocked");
    expect(confirm).toContain("isTerminalPaidState");
    expect(confirm).toContain("already_paid");
  });

  it("reconciles failed events with gateway truth before cancelling", () => {
    const confirm = source("services/payments/confirm-payment.ts");
    expect(confirm).toContain("payment_failure_reconciled_to_success");
    expect(confirm).toContain("payment_failure_confirmed");
    expect(confirm).toContain("reconcilePaymentWithGateway");
    expect(confirm).toContain("gateway_pending");
  });

  it("never writes failed status over succeeded payment rows", () => {
    const confirm = source("services/payments/confirm-payment.ts");
    expect(confirm).toContain('String(payment.status ?? "") === "succeeded" ? "succeeded" : event.status');
  });

  it("uses shared Razorpay resolution with capture and single-attempt settle", () => {
    const verify = source("services/payments/verify-razorpay-server.ts");
    expect(verify).toContain("resolveVerifiedRazorpayPayment");
    expect(verify).not.toContain("maxAttempts: 15");
    const resolution = source("services/payments/razorpay-payment-resolution.ts");
    expect(resolution).toContain("captureRazorpayPaymentIfAuthorized");
    expect(resolution).toContain("reconcileRazorpayOrderPayment");
    expect(resolution).toContain("One gateway fetch");
  });

  it("polls Cashfree verification on the server", () => {
    const verify = source("services/payments/verify-cashfree-server.ts");
    expect(verify).toContain("fetchPaymentStatus");
    expect(verify).toContain("scheduleGatewayReconcileFollowUp");
    expect(verify).not.toContain("maxAttempts = 10");
    expect(source("app/api/payments/verify/route.ts")).toContain("verifyCashfreePaymentOnServer");
  });

  it("allows verify recovery from failed payment rows", () => {
    const route = source("app/api/payments/verify/route.ts");
    expect(route).toContain("selectPaymentForVerify");
    expect(route).toContain('String(row.status ?? "") === "failed"');
    expect(route).toContain("retryable");
  });

  it("reconciles gateway status before expiring stale orders", () => {
    const expire = source("app/api/payments/expire-pending/route.ts");
    expect(expire).toContain("reconcilePaymentWithGateway");
    expect(expire).toContain('payment_hold');
    expect(expire).toContain('manual_admin');
    expect(expire).toContain("payment_expire_deferred");
    expect(expire).toContain("payment_expire_recovered");
    expect(expire).toContain("payment_expired_after_reconcile");
  });

  it("allows RPC recovery from cancelled false-failure orders", () => {
    const migration = source("supabase/migrations/20260708000100_payment_recovery_hardening.sql");
    expect(migration).toContain("payment.recovered_after_false_failure");
    expect(migration).toContain("v_recovering");
    expect(migration).toContain("'cancelled'");
  });

  it("classifies gateway reconciliation helpers", () => {
    expect(hasSuccessfulGatewayPayment({ provider: "razorpay", intentId: "o", status: "succeeded", amount: 1, currency: "INR", raw: {} })).toBe(true);
    expect(isPendingGatewayPayment({ provider: "cashfree", intentId: "o", status: "processing", amount: 1, currency: "INR", raw: {} })).toBe(true);
    expect(mapRazorpayPaymentEntityStatus("payment.captured", "captured")).toBe("succeeded");
    expect(mapRazorpayPaymentEntityStatus("payment.failed", "failed")).toBe("failed");
  });
});
