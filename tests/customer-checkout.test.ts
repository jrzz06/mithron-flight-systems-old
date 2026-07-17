import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isValidCheckoutPhone, parseCheckoutEnquiryRequestBody, parseCheckoutRequestBody } from "@/lib/api/checkout-schema";
import { buildCustomerCheckoutDraft, buildCustomerEnquiryOrderDraft, buildValidatedOrderDraft, transitionOrderStatus } from "@/services/orders";

describe("customer checkout workflow", () => {
  it("preserves customer_phone from metadata when phone input is absent", () => {
    const draft = buildValidatedOrderDraft(
      {
        customerEmail: "buyer@example.com",
        items: [{ productSlug: "ag10", quantity: 1 }],
        metadata: { customer_phone: "+919876543210" }
      },
      [{ slug: "ag10", name: "Ag10", price: 1000, category: "agriculture" }]
    );
    expect((draft.order.metadata as Record<string, unknown>).customer_phone).toBe("+919876543210");
  });

  it("builds pending-payment checkout drafts for authenticated customers", () => {
    const draft = buildCustomerCheckoutDraft(
      {
        customerEmail: "buyer@example.com",
        phone: "+919876543210",
        items: [{ productSlug: "ag10", quantity: 1 }],
        region: "India"
      },
      [{ slug: "ag10", name: "Ag10", price: 1000, category: "agriculture" }],
      "user-1"
    );
    expect(draft.order.status).toBe("pending_payment");
    expect(draft.order.payment_status).toBe("requires_payment");
    expect((draft.order.metadata as Record<string, unknown>).customer_phone).toBe("+919876543210");
  });

  it("builds admin-review enquiry orders for the admin orders queue", () => {
    const draft = buildCustomerEnquiryOrderDraft(
      {
        customerEmail: "buyer@example.com",
        phone: "+919876543210",
        enquiryMessage: "Need DGCA paperwork guidance for this sprayer.",
        items: [{ productSlug: "ag10", quantity: 1 }],
        region: "India"
      },
      [{ slug: "ag10", name: "Ag10", price: 1000, category: "agriculture" }],
      "user-1"
    );
    expect(draft.order.status).toBe("admin_review");
    expect(draft.order.payment_status).toBe("not_required");
    expect(draft.order.channel).toBe("enquiry");
    expect(Array.isArray(draft.order.timeline)).toBe(true);
    expect((draft.order.metadata as Record<string, unknown>).customer_phone).toBe("+919876543210");
  });

  it("supports guest checkout metadata when no user id is provided", () => {
    const draft = buildCustomerCheckoutDraft(
      {
        customerEmail: "guest@example.com",
        phone: "+919876543210",
        items: [{ productSlug: "ag10", quantity: 1 }]
      },
      [{ slug: "ag10", name: "Ag10", price: 1000, category: "agriculture" }],
      null
    );
    expect(draft.order.metadata.is_guest).toBe(true);
    expect(draft.order.metadata.created_by_user_id).toBeNull();
  });

  it("requires phone numbers in checkout schema parsing", () => {
    expect(parseCheckoutRequestBody({
      email: "buyer@example.com",
      phone: "+919876543210",
      fullName: "Buyer Example",
      items: [{ productSlug: "ag10", quantity: 1 }]
    })).not.toBeNull();
    expect(parseCheckoutRequestBody({
      email: "invalid-email",
      phone: "+919876543210",
      fullName: "Buyer Example",
      items: [{ productSlug: "ag10", quantity: 1 }]
    })).toBeNull();
    expect(parseCheckoutRequestBody({
      email: "buyer@example.com",
      items: [{ productSlug: "ag10", quantity: 1 }]
    })).toBeNull();
    expect(isValidCheckoutPhone("+91 98765 43210")).toBe(true);
  });

  it("rejects customer checkout drafts without phone", () => {
    expect(() => buildCustomerCheckoutDraft(
      {
        customerEmail: "buyer@example.com",
        items: [{ productSlug: "ag10", quantity: 1 }]
      },
      [{ slug: "ag10", name: "Ag10", price: 1000, category: "agriculture" }],
      null
    )).toThrow("phone");
  });

  it("accepts guest shipping addresses in enquiry requests", () => {
    const parsed = parseCheckoutEnquiryRequestBody({
      email: "guest@example.com",
      phone: "+919876543210",
      fullName: "Guest Buyer",
      message: "Need pricing for bulk order.",
      items: [{ productSlug: "ag10", quantity: 2 }],
      guestAddress: {
        line1: "12 Field Road",
        city: "Pune",
        region: "Maharashtra",
        postalCode: "411001"
      }
    });
    expect(parsed?.guestAddress?.city).toBe("Pune");
  });

  it("ships checkout API routes and single-form checkout page wiring", () => {
    expect(existsSync(join(process.cwd(), "app/api/checkout/route.ts"))).toBe(true);
    expect(existsSync(join(process.cwd(), "app/api/checkout/enquiry/route.ts"))).toBe(true);
    expect(existsSync(join(process.cwd(), "app/api/checkout/lead/route.ts"))).toBe(true);
    const checkoutPage = readFileSync(join(process.cwd(), "app/(storefront)/checkout/checkout-page-client.tsx"), "utf8");
    expect(checkoutPage).toContain("/api/checkout");
    expect(checkoutPage).toContain("/api/checkout/enquiry");
    expect(checkoutPage).toContain("/api/checkout/lead");
    expect(checkoutPage).toContain("saveCheckoutLead");
    expect(checkoutPage).toContain("Pay and place order");
    expect(checkoutPage).toContain("Send enquiry to Mithron");
    expect(checkoutPage).toContain("Send your enquiry");
    const enquiryRoute = readFileSync(join(process.cwd(), "app/api/checkout/enquiry/route.ts"), "utf8");
    expect(enquiryRoute).toContain("submitCheckoutProductEnquiry");
    expect(checkoutPage).toContain("CUSTOMER_CONTACT_REQUIRED_MESSAGE");
    expect(checkoutPage).toContain("isValidCheckoutEmail");
    expect(checkoutPage).not.toContain("Sign in to continue");
    expect(checkoutPage).not.toContain("setCheckoutStep");
    expect(checkoutPage).toContain("useCheckoutFlow");
    expect(checkoutPage).toContain("clearBuyNow");
    expect(checkoutPage).toContain("checkoutFlow: flow");
    expect(checkoutPage).toContain("checkout-auth-prompt");
    expect(checkoutPage).toContain("setCheckoutContact");
    const cartNav = readFileSync(join(process.cwd(), "components/navigation/cart-nav-button.tsx"), "utf8");
    expect(cartNav).toContain("openCartDrawer");
    expect(cartNav).toContain("cart-drawer");
  });

  it("transitions paid orders into fulfillment workflow", () => {
    expect(transitionOrderStatus("pending_payment", "paid")).toBe("paid");
    expect(transitionOrderStatus("paid", "admin_review")).toBe("admin_review");
  });
});
