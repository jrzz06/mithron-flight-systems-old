import { describe, expect, it } from "vitest";
import {
  calculateSalePrice,
  derivePricingFormState,
  resolveProductPricing
} from "@/lib/product-pricing";

describe("product pricing", () => {
  it("calculates fixed-amount sale prices", () => {
    expect(calculateSalePrice({
      listPrice: 475000,
      discountType: "amount",
      discountValue: 25000
    })).toBe(450000);
  });

  it("calculates percent sale prices", () => {
    expect(calculateSalePrice({
      listPrice: 100000,
      discountType: "percent",
      discountValue: 10
    })).toBe(90000);
  });

  it("maps on-sale pricing into stored price and compare_at values", () => {
    expect(resolveProductPricing({
      listPrice: 475000,
      onSale: true,
      discountType: "amount",
      discountValue: 25000,
      costOfGoods: 450000
    })).toMatchObject({
      price: 450000,
      compareAt: 475000,
      onSale: true,
      profit: 0,
      marginPercent: 0
    });
  });

  it("derives edit form state from stored sale pricing", () => {
    expect(derivePricingFormState({
      price: 450000,
      compareAt: 475000,
      onSale: true,
      discountType: "amount",
      discountValue: 25000,
      costOfGoods: 450000
    })).toEqual({
      listPrice: 475000,
      onSale: true,
      discountType: "amount",
      discountValue: 25000,
      costOfGoods: 450000
    });
  });
});
