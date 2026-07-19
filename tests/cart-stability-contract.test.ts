import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCheckoutEnquiryRequestBody } from "@/lib/api/checkout-schema";
import { mergeCartItemLists } from "@/lib/cart/cart-server-sync";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("cart & checkout stability contracts", () => {
  it("enforces auth cart concurrency control on PUT /api/account/cart", () => {
    const route = source("app/api/account/cart/route.ts");
    expect(route).toContain("X-Cart-Updated-At");
    expect(route).toContain("status: 409");
    // Avoid Redis→Postgres rate-limit cascade exceeding client 15s fetch timeout.
    expect(route).toContain('"fail_open"');
    expect(route).toContain("getCustomerCart(supabase, userId)");
  });

  it("uses idempotency keys + stock checks on authenticated cart mutations", () => {
    const route = source("app/api/account/cart/items/route.ts");
    expect(route).toContain("X-Idempotency-Key");
    expect(route).toContain("customer_cart_idempotency");
    expect(route).toContain("verifyCheckoutStockAvailability");
    expect(route).toContain("cart_stock_conflict");
    expect(route).toContain('"fail_open"');
    expect(route).toContain("getCustomerCart(supabase, userId)");
  });

  it("allows guests to add to cart and reach checkout without a login wall", () => {
    const checkoutClient = source("app/(storefront)/checkout/checkout-page-client.tsx");
    expect(checkoutClient).not.toContain("Guests must authenticate before checkout");
    expect(checkoutClient).toContain("checkout-auth-prompt");
    expect(checkoutClient).toContain("Send enquiry to Mithron");
    expect(checkoutClient).toContain("setCheckoutContact");

    const productConfigurator = source("sections/product/product-configurator.tsx");
    expect(productConfigurator).toContain("/checkout?flow=buy-now");
    expect(productConfigurator).not.toContain("/login?next=");
    expect(productConfigurator).not.toContain("GuestLoginRedirectDialog");

    const cartDrawer = source("components/overlays/cart-drawer.tsx");
    expect(cartDrawer).toContain('/checkout?flow=cart');
    expect(cartDrawer).not.toContain("/login?next=");
  });

  it("merges guest cart and preserves contact draft on sign-in", () => {
    const authSync = source("lib/cart/cart-auth-sync.ts");
    expect(authSync).toContain("mergeCartItemLists");
    expect(authSync).toContain("preserveCheckout");
    expect(authSync).toContain("readGuestCartSnapshot");
    expect(authSync).toContain("mergeGuestItems");

    const merged = mergeCartItemLists(
      [{ productSlug: "a", bundleId: "standard", quantity: 1 }],
      [{ productSlug: "a", bundleId: "standard", quantity: 2 }, { productSlug: "b", bundleId: "standard", quantity: 1 }]
    );
    expect(merged).toEqual([
      { productSlug: "a", bundleId: "standard", quantity: 3 },
      { productSlug: "b", bundleId: "standard", quantity: 1 }
    ]);
  });

  it("accepts guest checkout enquiry with contact and default message", () => {
    const result = validateCheckoutEnquiryRequestBody({
      email: "guest@example.com",
      phone: "+919876543210",
      fullName: "Guest Buyer",
      region: "India",
      items: [{ productSlug: "pixy", bundleId: "standard", quantity: 1 }],
      message: ""
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.message).toBe("Checkout enquiry from cart.");
      expect(result.data.fullName).toBe("Guest Buyer");
      expect(result.data.phone).toContain("9876543210");
    }
  });
});
