import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearGuestCartStorage,
  GUEST_CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  resetCartSession,
  useCartStore
} from "@/store/cart";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("cart auth sync wiring", () => {
  it("uses auth-aware cart initialization in the storefront shell", () => {
    const storeShell = source("components/layout/store-shell-client.tsx");
    expect(storeShell).toContain("useCartAuthSync");
    expect(storeShell).not.toContain("useCartStore.persist.rehydrate()");
  });

  it("clears guest storage keys", () => {
    const storage = new Map<string, string>();
    const localStorageMock = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      }
    };

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: localStorageMock
    });

    storage.set(LEGACY_CART_STORAGE_KEY, "legacy");
    storage.set(GUEST_CART_STORAGE_KEY, "guest");

    clearGuestCartStorage();

    expect(storage.has(LEGACY_CART_STORAGE_KEY)).toBe(false);
    expect(storage.has(GUEST_CART_STORAGE_KEY)).toBe(false);
  });

  it("resets cart session source and items atomically", () => {
    resetCartSession({
      source: "authenticated",
      items: [{ productSlug: "db-item", bundleId: "standard", quantity: 1 }],
      isCartSessionReady: true
    });

    const state = useCartStore.getState();
    expect(state.cartSource).toBe("authenticated");
    expect(state.items).toEqual([{ productSlug: "db-item", bundleId: "standard", quantity: 1 }]);
    expect(state.isCartSessionReady).toBe(true);
  });
});

describe("cart auth sync modules", () => {
  it("exports initialize and auth transition handlers", () => {
    const authSync = source("lib/cart/cart-auth-sync.ts");
    expect(authSync).toContain("initializeCartSession");
    expect(authSync).toContain("handleCartAuthSignedIn");
    expect(authSync).toContain("handleCartAuthSignedOut");
    expect(authSync).toContain("clearGuestCartStorage");
    expect(authSync).toContain("rehydrateBuyNowSession");
  });

  it("gates cart UI on session readiness", () => {
    expect(source("components/navigation/cart-nav-button.tsx")).toContain("useCartSessionReady");
    expect(source("hooks/use-resolved-cart.ts")).toContain("isCartSessionReady");
    expect(source("app/(storefront)/checkout/checkout-page-client.tsx")).toContain("isCartSessionReady");
  });

  it("exports initialize idempotency and sign-in buy-now rehydrate", () => {
    const authSync = source("lib/cart/cart-auth-sync.ts");
    expect(authSync).toContain("rehydrateBuyNowSession");
    expect(authSync).toContain("expectedSource === \"authenticated\"");
    expect(authSync).toContain("await rehydrateBuyNowSession()");
  });

  it("gates checkout buy-now redirects on hydration", () => {
    const checkoutPage = source("app/(storefront)/checkout/checkout-page-client.tsx");
    expect(checkoutPage).toContain("useBuyNowHasHydrated");
    expect(checkoutPage).toContain("isBuyNowSessionMissing");
  });

  it("passes checkout items into order summary", () => {
    const checkoutPage = source("app/(storefront)/checkout/checkout-page-client.tsx");
    const summary = source("components/checkout/checkout-order-summary.tsx");
    expect(checkoutPage).toContain("itemsOverride={checkoutItems}");
    expect(summary).toContain("itemsOverride");
    expect(summary).toContain("checkoutMode");
  });

  it("never rehydrates guest local storage for authenticated sessions", () => {
    const cartStore = source("store/cart.ts");
    const authSync = source("lib/cart/cart-auth-sync.ts");

    expect(cartStore).toContain('cartSource !== "guest"');
    expect(cartStore).toContain("rehydrateGuestCartOnly");
    expect(cartStore).toContain('cartSource === "authenticated"');
    expect(authSync).toContain("rehydrateGuestCartOnly");
    expect(authSync).not.toContain("useCartStore.persist.rehydrate()");
  });
});
