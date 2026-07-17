import { describe, expect, it } from "vitest";
import { parseCheckoutRequestBody } from "@/lib/api/checkout-schema";

describe("checkout request schema", () => {
  it("accepts valid checkout payloads", () => {
    const parsed = parseCheckoutRequestBody({
      email: "buyer@example.com",
      phone: "+919876543210",
      fullName: "Buyer Example",
      items: [{ productSlug: "drone-x", quantity: 2 }],
      addressId: "addr-1",
      region: "IN-KA"
    });

    expect(parsed).toEqual({
      email: "buyer@example.com",
      phone: "+919876543210",
      fullName: "Buyer Example",
      items: [{ productSlug: "drone-x", quantity: 2 }],
      addressId: "addr-1",
      region: "IN-KA",
      billingSameAsShipping: true
    });
  });

  it("rejects invalid quantities, missing email, and invalid phone", () => {
    expect(parseCheckoutRequestBody({ email: "", items: [] })).toBeNull();
    expect(parseCheckoutRequestBody({ email: "a@b.com", fullName: "A B", items: [{ productSlug: "x", quantity: 0 }] })).toBeNull();
    expect(parseCheckoutRequestBody({ email: "a@b.com", fullName: "A B", items: [{ productSlug: "x", quantity: 100 }] })).toBeNull();
    expect(parseCheckoutRequestBody({ email: "a@b.com", phone: "123", fullName: "A B", items: [{ productSlug: "x", quantity: 1 }] })).toBeNull();
    expect(parseCheckoutRequestBody({ email: "not-an-email", phone: "+919876543210", fullName: "A B", items: [{ productSlug: "x", quantity: 1 }] })).toBeNull();
  });

  it("merges duplicate product slugs and caps combined quantity at 99", () => {
    expect(parseCheckoutRequestBody({
      email: "buyer@example.com",
      phone: "+919876543210",
      fullName: "Buyer Example",
      items: [
        { productSlug: "drone-x", quantity: 40 },
        { productSlug: "drone-x", quantity: 50 }
      ]
    })).toEqual({
      email: "buyer@example.com",
      phone: "+919876543210",
      fullName: "Buyer Example",
      items: [{ productSlug: "drone-x", quantity: 90 }],
      billingSameAsShipping: true
    });

    expect(parseCheckoutRequestBody({
      email: "buyer@example.com",
      phone: "+919876543210",
      fullName: "Buyer Example",
      items: [
        { productSlug: "drone-x", quantity: 60 },
        { productSlug: "drone-x", quantity: 40 }
      ]
    })).toBeNull();
  });
});

describe("checkout stock service contract", () => {
  it("exports atomic reservation helpers", async () => {
    const checkoutStock = await import("@/services/checkout-stock");
    expect(typeof checkoutStock.reserveCheckoutStock).toBe("function");
    expect(typeof checkoutStock.releaseCheckoutStock).toBe("function");
    expect(typeof checkoutStock.resolveCheckoutStockSkus).toBe("function");
  });
});

describe("product publish service contract", () => {
  it("exports unified publish helpers", async () => {
    const productPublish = await import("@/services/product-publish");
    expect(typeof productPublish.publishProductToStorefront).toBe("function");
    expect(typeof productPublish.assertProductCanPublish).toBe("function");
  });
});

describe("inventory manager rename", () => {
  it("uses Supabase inventory naming instead of Wix UI labels", async () => {
    const inventoryManager = await import("@/components/admin/inventory-manager");
    expect(typeof inventoryManager.InventoryManager).toBe("function");
  });
});
