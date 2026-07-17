import { describe, expect, it, vi } from "vitest";
import { inrAmountsMatch, inrToPaise, normalizeInrAmount } from "@/services/payments/amount";
import { resolvePaymentRecordForEvent } from "@/services/payments/resolve-payment-record";

describe("payment amount helpers", () => {
  it("normalizes INR amounts to two decimal places", () => {
    expect(normalizeInrAmount(1.185)).toBe(1.19);
    expect(inrToPaise(1.18)).toBe(118);
  });

  it("matches gateway and order totals within one paisa tolerance", () => {
    expect(inrAmountsMatch(1.18, 1.18)).toBe(true);
    expect(inrAmountsMatch(1.18, 1.179)).toBe(true);
    expect(inrAmountsMatch(1.18, 1.16)).toBe(false);
  });
});

describe("resolvePaymentRecordForEvent", () => {
  it("falls back to internal order id from provider metadata", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const target = String(url);
      if (target.includes("provider_intent_id=eq.order_cf")) {
        return { ok: true, json: async () => [] };
      }
      if (target.includes("order_id=eq.internal-order-1")) {
        return {
          ok: true,
          json: async () => [{
            id: "pay-1",
            provider: "cashfree",
            provider_intent_id: "ORD_123",
            order_id: "internal-order-1",
            amount: 118,
            currency: "INR",
            status: "requires_payment"
          }]
        };
      }
      return { ok: true, json: async () => [] };
    }) as typeof fetch;

    const payment = await resolvePaymentRecordForEvent("cashfree", {
      provider: "cashfree",
      intentId: "order_cf",
      status: "succeeded",
      amount: 1.18,
      currency: "INR",
      raw: {
        data: {
          order: {
            order_id: "order_cf",
            order_note: "internal-order-1"
          }
        }
      }
    });

    expect(payment?.id).toBe("pay-1");
    global.fetch = originalFetch;
  });
});
