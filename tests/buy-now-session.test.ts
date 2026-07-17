import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { mergeRehydratedBuyNowState, useBuyNowStore } from "@/store/buy-now-session";
import { createCartSlice } from "@/store/cart";
import { parseCheckoutRequestBody } from "@/lib/api/checkout-schema";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("buy now session", () => {
  beforeEach(() => {
    useBuyNowStore.setState({ active: false, item: null, updatedAt: 0, _hasHydrated: false });
  });

  it("stores a single buy-now line without touching cart", () => {
    const cart = createCartSlice();
    useBuyNowStore.getState().startBuyNow({
      productSlug: "pixy-lr",
      bundleId: "standard",
      quantity: 2,
      productName: "Pixy LR"
    });

    expect(useBuyNowStore.getState().active).toBe(true);
    expect(useBuyNowStore.getState().item?.quantity).toBe(2);
    expect(cart.items).toHaveLength(0);
  });

  it("clears buy-now session independently", () => {
    useBuyNowStore.getState().startBuyNow({
      productSlug: "pixy-lr",
      bundleId: "standard",
      quantity: 1
    });
    useBuyNowStore.getState().clearBuyNow();
    expect(useBuyNowStore.getState().active).toBe(false);
    expect(useBuyNowStore.getState().item).toBeNull();
  });

  it("preserves active in-memory session over empty persisted state", () => {
    const current = {
      active: true,
      item: {
        productSlug: "pixy-lr",
        bundleId: "standard",
        quantity: 1
      },
      updatedAt: 200
    };

    const merged = mergeRehydratedBuyNowState({ active: false, item: null, updatedAt: 0 }, current);

    expect(merged.active).toBe(true);
    expect(merged.item?.productSlug).toBe("pixy-lr");
  });

  it("rejects stale persisted session when memory was cleared more recently", () => {
    const merged = mergeRehydratedBuyNowState(
      {
        active: true,
        item: { productSlug: "old-product", bundleId: "standard", quantity: 1 },
        updatedAt: 100
      },
      { active: false, item: null, updatedAt: 200 }
    );

    expect(merged.active).toBe(false);
    expect(merged.item).toBeNull();
  });

  it("replaces previous buy-now product when startBuyNow is called again", () => {
    useBuyNowStore.getState().startBuyNow({
      productSlug: "product-a",
      bundleId: "standard",
      quantity: 1
    });
    useBuyNowStore.getState().startBuyNow({
      productSlug: "product-b",
      bundleId: "standard",
      quantity: 2
    });

    expect(useBuyNowStore.getState().item?.productSlug).toBe("product-b");
    expect(useBuyNowStore.getState().item?.quantity).toBe(2);
  });

  it("updates buy-now quantity independently from cart", () => {
    useBuyNowStore.getState().startBuyNow({
      productSlug: "pixy-lr",
      bundleId: "standard",
      quantity: 1
    });
    useBuyNowStore.getState().updateBuyNowQuantity(3);
    expect(useBuyNowStore.getState().item?.quantity).toBe(3);
  });

  it("uses persisted state when no active in-memory session exists", () => {
    const persisted = {
      active: true,
      item: {
        productSlug: "ag10",
        bundleId: "standard",
        quantity: 2
      }
    };

    const merged = mergeRehydratedBuyNowState(
      persisted,
      { active: false, item: null, updatedAt: 0 }
    );

    expect(merged.active).toBe(true);
    expect(merged.item?.productSlug).toBe("ag10");
    expect(merged.item?.quantity).toBe(2);
  });

  it("parses checkout items with bundle and variant identity", () => {
    const parsed = parseCheckoutRequestBody({
      email: "buyer@example.com",
      phone: "+919876543210",
      fullName: "Buyer Example",
      items: [
        { productSlug: "ag10", bundleId: "standard", variantId: "red", quantity: 1 },
        { productSlug: "ag10", bundleId: "pro-kit", quantity: 1 }
      ]
    });

    expect(parsed?.items).toHaveLength(2);
    expect(parsed?.items[0]).toMatchObject({ productSlug: "ag10", bundleId: "standard", variantId: "red", quantity: 1 });
    expect(parsed?.items[1]).toMatchObject({ productSlug: "ag10", bundleId: "pro-kit", quantity: 1 });
  });
});

describe("cart addToCart", () => {
  it("adds items without opening mini cart unless requested", () => {
    const cart = createCartSlice();
    cart.addToCart(
      { productSlug: "pixy-lr", bundleId: "standard", quantity: 1, productName: "Pixy LR" },
      { openMiniCart: false }
    );
    expect(cart.items).toHaveLength(1);
    expect(cart.isCartOpen).toBe(false);

    cart.addToCart(
      { productSlug: "pixy-mr", bundleId: "standard", quantity: 1, productName: "Pixy MR" },
      { openMiniCart: true }
    );
    expect(cart.items).toHaveLength(2);
    expect(cart.isCartOpen).toBe(true);
    expect(cart.cartDrawerMode).toBe("confirmation");
  });

  it("increments quantity when adding the same line again", () => {
    const cart = createCartSlice();
    cart.addToCart({ productSlug: "pixy-lr", bundleId: "standard", quantity: 2, productName: "Pixy LR" });
    cart.addToCart({ productSlug: "pixy-lr", bundleId: "standard", quantity: 2, productName: "Pixy LR" });
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.quantity).toBe(4);
  });
});
