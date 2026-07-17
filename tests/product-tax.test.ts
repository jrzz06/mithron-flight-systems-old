import { describe, expect, it } from "vitest";
import { calculateProductTaxBreakdown, summarizeCartPricingBreakdown, summarizeCartTax } from "@/lib/product-tax";

describe("product tax", () => {
  it("adds GST on top of exclusive prices", () => {
    expect(calculateProductTaxBreakdown({
      unitPrice: 475000,
      quantity: 1,
      chargeTax: true,
      taxGroup: "products-default",
      taxRate: 18,
      taxIncluded: false
    })).toMatchObject({
      taxableBase: 475000,
      taxAmount: 85500,
      lineTotal: 560500
    });
  });

  it("extracts GST from inclusive prices", () => {
    expect(calculateProductTaxBreakdown({
      unitPrice: 450000,
      quantity: 1,
      chargeTax: true,
      taxGroup: "agri-drones",
      taxRate: 5,
      taxIncluded: true
    })).toMatchObject({
      taxableBase: 428571.43,
      taxAmount: 21428.57,
      lineTotal: 450000
    });
  });

  it("summarizes cart GST consistently", () => {
    expect(summarizeCartTax([
      {
        unitPrice: 100000,
        quantity: 1,
        chargeTax: true,
        taxGroup: "agri-drones",
        taxRate: 5
      },
      {
        unitPrice: 33000,
        quantity: 2,
        chargeTax: true,
        taxGroup: "agri-accessories",
        taxRate: 12
      }
    ])).toMatchObject({
      subtotal: 166000,
      taxTotal: 12920,
      total: 178920
    });
  });

  it("builds checkout summary with GST + SGST and balanced rounding", () => {
    const summary = summarizeCartPricingBreakdown([
      {
        unitPrice: 99500,
        quantity: 1,
        chargeTax: true,
        taxGroup: "products-default",
        taxRate: 18,
        taxIncluded: false
      }
    ]);

    expect(summary).toMatchObject({
      itemsTotal: 99500,
      gstSgstTotal: 17910,
      roundingOff: 0,
      finalAmount: 117410
    });
    expect(summary.finalAmount).toBe(summary.itemsTotal + summary.gstSgstTotal + summary.roundingOff);
  });

  it("returns zeroed summary for empty carts", () => {
    expect(summarizeCartPricingBreakdown([])).toMatchObject({
      itemsTotal: 0,
      gstSgstTotal: 0,
      roundingOff: 0,
      finalAmount: 0
    });
  });
});
