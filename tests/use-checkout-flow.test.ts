import { describe, expect, it } from "vitest";
import { resolveCheckoutItems } from "@/hooks/use-checkout-flow";

describe("resolveCheckoutItems", () => {
  const cartItems = [
    { productSlug: "old-cart-item", bundleId: "standard", quantity: 2 }
  ];

  const buyNowItem = {
    productSlug: "selected-product",
    bundleId: "standard",
    quantity: 1
  };

  it("returns only the buy-now item in buy-now flow", () => {
    expect(
      resolveCheckoutItems({
        flow: "buy-now",
        buyNowItem,
        cartItems
      })
    ).toEqual([buyNowItem]);
  });

  it("never falls back to cart items when buy-now session is missing", () => {
    expect(
      resolveCheckoutItems({
        flow: "buy-now",
        buyNowItem: null,
        cartItems
      })
    ).toEqual([]);
  });

  it("returns cart items in cart flow", () => {
    expect(
      resolveCheckoutItems({
        flow: "cart",
        buyNowItem,
        cartItems
      })
    ).toEqual(cartItems);
  });
});
