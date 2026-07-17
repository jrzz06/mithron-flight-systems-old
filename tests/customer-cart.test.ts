import { describe, expect, it } from "vitest";
import { validateCustomerCartItems } from "@/services/customer-cart";

describe("validateCustomerCartItems", () => {
  it("normalizes valid cart items", () => {
    const items = validateCustomerCartItems([
      {
        productSlug: "pixy-lr",
        bundleId: "standard",
        quantity: 2,
        productName: "Pixy LR"
      }
    ]);

    expect(items).toEqual([
      {
        productSlug: "pixy-lr",
        bundleId: "standard",
        quantity: 2,
        productName: "Pixy LR"
      }
    ]);
  });

  it("rejects non-array payloads", () => {
    expect(() => validateCustomerCartItems({})).toThrow("Cart items must be an array.");
  });

  it("rejects oversized carts", () => {
    const items = Array.from({ length: 101 }, (_, index) => ({
      productSlug: `product-${index}`,
      bundleId: "standard",
      quantity: 1
    }));

    expect(() => validateCustomerCartItems(items)).toThrow("Cart cannot contain more than 100 line items.");
  });
});
