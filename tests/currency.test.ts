import { describe, expect, it } from "vitest";
import {
  addInr,
  assertOrderTotalsBalance,
  computeOrderTotal,
  formatInrAmount,
  formatInrDisplay,
  fromPaise,
  inrToPaise,
  roundInr,
  subtractInr,
  sumInr,
  toPaise
} from "@/lib/currency";
import { summarizeCartTax } from "@/lib/product-tax";
import { buildValidatedOrderDraft } from "@/services/orders";

describe("lib/currency", () => {
  it("converts INR via integer paise", () => {
    expect(roundInr(1.185)).toBe(1.19);
    expect(inrToPaise(1.18)).toBe(118);
    expect(fromPaise(118)).toBe(1.18);
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });

  it("sums without floating-point drift", () => {
    expect(sumInr([0.1, 0.2])).toBe(0.3);
    expect(addInr(10.01, 20.02)).toBe(30.03);
    expect(subtractInr(100.5, 0.25)).toBe(100.25);
  });

  it("formats whole rupees without .00", () => {
    expect(formatInrDisplay(1250)).toMatch(/₹\s?1,250/);
    expect(formatInrDisplay(1250)).not.toContain(".00");
    expect(formatInrAmount(1250)).toBe("1,250");
  });

  it("formats fractional rupees with two decimal places", () => {
    expect(formatInrDisplay(1250.5)).toMatch(/₹\s?1,250\.50/);
    expect(formatInrAmount(1250.5)).toBe("1,250.50");
    expect(formatInrAmount(35398.82)).toBe("35,398.82");
  });

  it("keeps order total identity with shipping and discount", () => {
    const input = {
      subtotal: 29999,
      taxTotal: 5399.82,
      shipping: 200,
      discount: 100
    };
    const total = computeOrderTotal(input);
    expect(() => assertOrderTotalsBalance({ ...input, total })).not.toThrow();
    expect(total).toBe(35498.82);
  });

  it("aligns cart tax summary with line totals", () => {
    const pricing = summarizeCartTax([
      { unitPrice: 29999, quantity: 1, chargeTax: true, taxRate: 18, taxIncluded: false }
    ]);
    expect(pricing.subtotal + pricing.taxTotal).toBe(pricing.total);
    expect(inrToPaise(pricing.total)).toBe(3539882);
  });

  it("aligns order draft total with gateway paise", () => {
    const draft = buildValidatedOrderDraft(
      {
        customerEmail: "test@example.com",
        items: [{ productSlug: "guru-student-drone", quantity: 1 }]
      },
      [
        {
          slug: "guru-student-drone",
          name: "Guru Student Drone",
          price: 29999,
          category: "drones",
          chargeTax: true,
          taxRate: 18,
          taxIncluded: false
        }
      ]
    );
    expect(draft.order.subtotal + Number(draft.order.metadata.tax_total)).toBe(draft.order.total);
    expect(inrToPaise(draft.order.total)).toBe(inrToPaise(draft.order.total));
  });
});
