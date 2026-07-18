import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  leadSourceLabel,
  normalizeLeadSource
} from "@/lib/leads/shared";
import {
  contactRequestLeadStatus,
  contactRequestLeadStatusLabel,
  contactRequestMatchesLeadStatusFilter
} from "@/services/contact-requests";
import { validateCheckoutLeadRequestBody } from "@/lib/api/checkout-schema";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("lead capture into Leads", () => {
  it("normalizes lead sources for admin display", () => {
    expect(normalizeLeadSource("product_page")).toBe("product_enquiry");
    expect(normalizeLeadSource("buy_now")).toBe("checkout_enquiry");
    expect(leadSourceLabel("product_enquiry")).toBe("Product");
    expect(leadSourceLabel("checkout_enquiry")).toBe("Checkout");
    expect(leadSourceLabel("contact_form")).toBe("Contact");
  });

  it("maps workflow statuses to New / Converted / Closed", () => {
    expect(contactRequestLeadStatus("new")).toBe("new");
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

  it("wires product enquiry and checkout lead capture into leads", () => {
    const enquiries = source("services/enquiries.ts");
    expect(enquiries).toContain("product_enquiry");
    expect(enquiries).toContain("submitLead");

    const leadRoute = source("app/api/checkout/lead/route.ts");
    expect(leadRoute).toContain("submitLead");
    expect(leadRoute).toContain("buy_now");

    const checkoutPage = source("app/(storefront)/checkout/checkout-page-client.tsx");
    expect(checkoutPage).toContain("/api/checkout/lead");
    expect(checkoutPage).toContain("saveCheckoutLead");
  });

  it("keeps Product Enquiry UI path while writing to leads", () => {
    const form = source("components/product/product-enquiry-form.tsx");
    expect(form).toContain("/api/products/enquiry");
    expect(form).not.toContain("/api/checkout/lead");

    const productRoute = source("app/api/products/enquiry/route.ts");
    expect(productRoute).toContain("submitLead");
  });

  it("shows Source, Product, Customer, Phone, Status in Leads queue", () => {
    const queue = source("components/admin/admin-lead-queue.tsx");
    expect(queue).toContain("Source");
    expect(queue).toContain("Product");
    expect(queue).toContain("Customer");
    expect(queue).toContain("Phone");
    expect(queue).toContain("Status");
    expect(queue).toContain("leadSourceLabel");

    const page = source("app/admin/leads/page.tsx");
    expect(page).toContain('label: "New"');
    expect(page).toContain('label: "Converted"');
  });
});
