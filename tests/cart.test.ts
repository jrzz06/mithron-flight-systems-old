import { describe, expect, it } from "vitest";
import { createCartSlice, mergeRehydratedCartState } from "@/store/cart";

describe("cart store core", () => {
  it("adds bundles, merges repeated items, and tracks item counts without persisting prices", () => {
    const cart = createCartSlice();

    cart.addItem({
      productSlug: "source-agri-kisan-drone-small-8-liter",
      bundleId: "standard",
      productName: "Agri Kisan Drone Small - 8 Liter",
      image: "https://example.com/drone.webp"
    });
    cart.addItem({
      productSlug: "source-agri-kisan-drone-small-8-liter",
      bundleId: "standard",
      productName: "Agri Kisan Drone Small - 8 Liter",
      image: "https://example.com/drone.webp"
    });

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.quantity).toBe(2);
    expect(cart.items[0]?.productName).toBe("Agri Kisan Drone Small - 8 Liter");
    expect(cart.items[0]?.image).toBe("https://example.com/drone.webp");
    expect(cart.items[0]).not.toHaveProperty("unitPrice");
    expect(cart.itemCount()).toBe(2);
  });

  it("tracks deployment configuration progress", () => {
    const cart = createCartSlice();

    cart.setCheckoutStep("payment");
    cart.setPromoCode("MITHRON-FIELD");

    expect(cart.checkout.step).toBe("payment");
    expect(cart.checkout.promoCode).toBe("MITHRON-FIELD");
  });

  it("normalizes empty bundle ids to standard", () => {
    const cart = createCartSlice();

    cart.addItem({
      productSlug: "pixy-lr",
      bundleId: "",
      productName: "Pixy LR"
    });

    expect(cart.items[0]?.bundleId).toBe("standard");
  });

  it("keeps in-memory cart items when rehydrated storage is empty", () => {
    const currentState = createCartSlice();
    currentState.addItem({
      productSlug: "pixy-lr",
      bundleId: "standard",
      productName: "Pixy LR"
    });

    const merged = mergeRehydratedCartState({ items: [], checkout: currentState.checkout }, currentState);

    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]?.productSlug).toBe("pixy-lr");
  });

  it("prefers rehydrated cart items when storage has data", () => {
    const currentState = createCartSlice();
    const merged = mergeRehydratedCartState(
      {
        items: [{ productSlug: "stored-product", bundleId: "standard", quantity: 2 }],
        checkout: currentState.checkout
      },
      currentState
    );

    expect(merged.items).toEqual([{ productSlug: "stored-product", bundleId: "standard", quantity: 2 }]);
  });
});

describe("cart session storage", () => {
  it("exports guest-only storage keys and session helpers", async () => {
    const cartModule = await import("@/store/cart");
    expect(cartModule.GUEST_CART_STORAGE_KEY).toBe("mithron-aero-cart-guest");
    expect(cartModule.LEGACY_CART_STORAGE_KEY).toBe("mithron-aero-cart");
    expect(typeof cartModule.resetCartSession).toBe("function");
    expect(typeof cartModule.clearGuestCartStorage).toBe("function");
    expect(typeof cartModule.rehydrateGuestCartOnly).toBe("function");
  });
});
