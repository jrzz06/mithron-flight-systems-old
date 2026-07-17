import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  contactRequestLeadStatus,
  contactRequestLeadStatusLabel,
  contactRequestMatchesLeadStatusFilter,
  contactRequestSourceLabel,
  normalizeContactRequestLeadSource
} from "@/lib/contact-requests/shared";
import { validateCheckoutLeadRequestBody } from "@/lib/api/checkout-schema";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("lead capture into Contact Requests", () => {
  it("normalizes lead sources for admin display", () => {
    expect(normalizeContactRequestLeadSource("product_page")).toBe("product_enquiry");
    expect(normalizeContactRequestLeadSource("buy-now")).toBe("buy_now");
    expect(contactRequestSourceLabel("product_enquiry")).toBe("Product Enquiry");
    expect(contactRequestSourceLabel("buy_now")).toBe("Buy Now");
    expect(contactRequestSourceLabel("checkout")).toBe("Checkout");
  });

  it("maps workflow statuses to New / Contacted / Converted / Closed", () => {
    expect(contactRequestLeadStatus("new")).toBe("new");
    expect(contactRequestLeadStatus("qualified")).toBe("contacted");
    expect(contactRequestLeadStatus("converted")).toBe("converted");
    expect(contactRequestLeadStatusLabel("converted")).toBe("Converted");
    expect(contactRequestLeadStatusLabel("archived")).toBe("Closed");
    expect(contactRequestMatchesLeadStatusFilter("rejected", "closed")).toBe(true);
    expect(contactRequestMatchesLeadStatusFilter("converted", "converted")).toBe(true);
    expect(contactRequestMatchesLeadStatusFilter("new", "contacted")).toBe(false);
  });

  it("validates Buy Now and Checkout lead payloads", () => {
    const buyNow = validateCheckoutLeadRequestBody({
      email: "buyer@example.com",
      phone: "+919876543210",
      fullName: "Buyer Name",
      source: "buy_now",
      items: [{ productSlug: "agri-drone", productName: "Agri Drone", quantity: 1 }]
    });
    expect(buyNow.ok).toBe(true);
    if (buyNow.ok) expect(buyNow.data.source).toBe("buy_now");

    const missingName = validateCheckoutLeadRequestBody({
      email: "buyer@example.com",
      phone: "+919876543210",
      fullName: "",
      source: "checkout",
      items: [{ productSlug: "agri-drone", quantity: 1 }]
    });
    expect(missingName.ok).toBe(false);
  });

  it("wires product enquiry dual-write and checkout lead capture", () => {
    const enquiries = source("services/enquiries.ts");
    expect(enquiries).toContain('source: "product_enquiry"');
    expect(enquiries).toContain("submitContactRequest");
    expect(enquiries).toContain('source: "checkout"');

    const leadRoute = source("app/api/checkout/lead/route.ts");
    expect(leadRoute).toContain("submitContactRequest");
    expect(leadRoute).toContain("buy_now");

    const checkoutPage = source("app/(storefront)/checkout/checkout-page-client.tsx");
    expect(checkoutPage).toContain("/api/checkout/lead");
    expect(checkoutPage).toContain("saveCheckoutLead");
    expect(checkoutPage).toContain('source: isBuyNowFlow ? "buy_now" : "checkout"');
  });

  it("keeps Product Enquiry UI path unchanged while mirroring to Contact Requests", () => {
    const form = source("components/product/product-enquiry-form.tsx");
    expect(form).toContain("/api/products/enquiry");
    expect(form).not.toContain("/api/checkout/lead");
    expect(form).not.toContain("/api/contact-requests");

    const productRoute = source("app/api/products/enquiry/route.ts");
    expect(productRoute).toContain("submitProductPageEnquiry");
  });

  it("shows Source, Product, Customer, Email, Phone, Date, Status in Contact Requests queue", () => {
    const queue = source("components/admin/admin-contact-request-queue.tsx");
    expect(queue).toContain("Source");
    expect(queue).toContain("Product");
    expect(queue).toContain("Customer");
    expect(queue).toContain("Email");
    expect(queue).toContain("Phone");
    expect(queue).toContain("Date");
    expect(queue).toContain("Status");
    expect(queue).toContain("contactRequestSourceLabel");
    expect(queue).toContain("contactRequestLeadStatus");

    const page = source("app/admin/contact-requests/page.tsx");
    expect(page).toContain('label: "New"');
    expect(page).toContain('label: "Contacted"');
    expect(page).toContain('label: "Closed"');
  });
});
