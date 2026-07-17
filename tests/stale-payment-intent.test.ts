import { describe, expect, it } from "vitest";
import { isStaleCheckoutPayment, STALE_CHECKOUT_PAYMENT_MS } from "@/lib/checkout/stale-payment-intent";

describe("stale checkout payment intent", () => {
  it("treats missing timestamps as stale", () => {
    expect(isStaleCheckoutPayment(null)).toBe(true);
    expect(isStaleCheckoutPayment(undefined)).toBe(true);
    expect(isStaleCheckoutPayment("")).toBe(true);
  });

  it("treats recent payments as fresh", () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    expect(isStaleCheckoutPayment(recent)).toBe(false);
  });

  it("treats payments older than the threshold as stale", () => {
    const stale = new Date(Date.now() - STALE_CHECKOUT_PAYMENT_MS - 1_000).toISOString();
    expect(isStaleCheckoutPayment(stale)).toBe(true);
  });
});
