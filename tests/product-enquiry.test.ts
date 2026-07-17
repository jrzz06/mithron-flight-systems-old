import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProductEnquiryRequestBody } from "@/lib/api/product-enquiry-schema";
import {
  enquiryBillingAddress,
  enquiryProductId,
  enquiryProductUrl,
  enquiryShippingAddress,
  formatEnquiryAddress
} from "@/lib/enquiries/shared";

const validAddress = {
  line1: "35/1 GST Road",
  city: "Chennai",
  state: "Tamil Nadu",
  country: "India",
  postalCode: "600043"
};

describe("product enquiry schema", () => {
  it("accepts a valid product enquiry payload without addresses", () => {
    const parsed = parseProductEnquiryRequestBody({
      fullName: "Mithron Buyer",
      email: "buyer@example.com",
      phone: "+919876543210",
      message: "Need pricing for fleet purchase.",
      productSlug: "pixy-lr",
      productName: "Pixy LR",
      productSku: "PIXY-LR",
      preferredContactMethod: "whatsapp",
      quantity: 3,
      company: "Mithron Farms",
      region: "India"
    });

    expect(parsed?.productSlug).toBe("pixy-lr");
    expect(parsed?.productSku).toBe("PIXY-LR");
    expect(parsed?.preferredContactMethod).toBe("whatsapp");
    expect(parsed?.quantity).toBe(3);
    expect(parsed?.region).toBe("India");
    expect(parsed?.company).toBe("Mithron Farms");
    expect(parsed?.shippingAddress).toBeUndefined();
    expect(parsed?.billingAddress).toBeUndefined();
  });

  it("accepts a valid product enquiry payload with addresses", () => {
    const parsed = parseProductEnquiryRequestBody({
      fullName: "Mithron Buyer",
      email: "buyer@example.com",
      phone: "+919876543210",
      message: "Need pricing for fleet purchase.",
      productSlug: "pixy-lr",
      productName: "Pixy LR",
      productSku: "PIXY-LR",
      preferredContactMethod: "whatsapp",
      quantity: 3,
      company: "Mithron Farms",
      billingSameAsShipping: true,
      shippingAddress: validAddress,
      billingAddress: validAddress
    });

    expect(parsed?.productSlug).toBe("pixy-lr");
    expect(parsed?.productSku).toBe("PIXY-LR");
    expect(parsed?.preferredContactMethod).toBe("whatsapp");
    expect(parsed?.quantity).toBe(3);
    expect(parsed?.region).toBe("India");
    expect(parsed?.company).toBe("Mithron Farms");
    expect(parsed?.billingSameAsShipping).toBe(true);
    expect(parsed?.shippingAddress).toEqual(validAddress);
    expect(parsed?.billingAddress).toEqual(validAddress);
  });

  it("copies shipping into billing when same-as-shipping is checked", () => {
    const parsed = parseProductEnquiryRequestBody({
      fullName: "Buyer",
      email: "buyer@example.com",
      phone: "+919876543210",
      productSlug: "pixy-lr",
      productName: "Pixy LR",
      productSku: "PIXY-LR",
      preferredContactMethod: "email",
      billingSameAsShipping: true,
      shippingAddress: validAddress,
      billingAddress: {
        line1: "Other street",
        city: "Other",
        state: "Other",
        country: "India",
        postalCode: "110001"
      }
    });

    expect(parsed?.billingAddress).toEqual(validAddress);
  });

  it("requires a separate billing address when same-as-shipping is unchecked", () => {
    expect(parseProductEnquiryRequestBody({
      fullName: "Buyer",
      email: "buyer@example.com",
      phone: "+919876543210",
      productSlug: "pixy-lr",
      productName: "Pixy LR",
      productSku: "PIXY-LR",
      preferredContactMethod: "email",
      billingSameAsShipping: false,
      shippingAddress: validAddress
    })).toBeNull();
  });

  it("accepts optional notes and legacy sku alias with addresses", () => {
    const parsed = parseProductEnquiryRequestBody({
      fullName: "Buyer",
      email: "buyer@example.com",
      phone: "+919876543210",
      productSlug: "pixy-lr",
      productName: "Pixy LR",
      sku: "PIXY-LR",
      preferredContactMethod: "email",
      billingSameAsShipping: true,
      shippingAddress: validAddress,
      billingAddress: validAddress
    });

    expect(parsed?.productSku).toBe("PIXY-LR");
    expect(parsed?.message).toBeUndefined();
  });

  it("rejects missing preferred contact method", () => {
    expect(parseProductEnquiryRequestBody({
      fullName: "Buyer",
      email: "buyer@example.com",
      phone: "+919876543210",
      productSlug: "pixy-lr",
      productName: "Pixy LR",
      productSku: "PIXY-LR"
    })).toBeNull();
  });

  it("defaults region to India when address and region are omitted", () => {
    const parsed = parseProductEnquiryRequestBody({
      fullName: "Buyer",
      email: "buyer@example.com",
      phone: "+919876543210",
      productSlug: "pixy-lr",
      productName: "Pixy LR",
      productSku: "PIXY-LR",
      preferredContactMethod: "phone"
    });

    expect(parsed?.region).toBe("India");
    expect(parsed?.shippingAddress).toBeUndefined();
  });

  it("returns honeypot payload when website is filled", () => {
    const parsed = parseProductEnquiryRequestBody({
      website: "https://spam.example",
      fullName: "Bot"
    });
    expect(parsed?.productSlug).toBe("");
    expect(parsed?.preferredContactMethod).toBe("email");
  });
});

describe("product enquiry admin helpers", () => {
  it("reads shipping/billing and product identity from payload", () => {
    const enquiry = {
      id: "1",
      customer_email: "buyer@example.com",
      subject: "Product enquiry",
      body: "…",
      status: "new",
      source: "product_page" as const,
      queue_kind: "enquiry" as const,
      related_product_slug: "pixy-lr",
      payload: {
        product_id: "pixy-lr",
        product_url: "https://example.com/product/pixy-lr",
        shipping_address: {
          line1: "35/1 GST Road",
          city: "Chennai",
          state: "Tamil Nadu",
          country: "India",
          postal_code: "600043"
        },
        billing_address: {
          line1: "35/1 GST Road",
          city: "Chennai",
          state: "Tamil Nadu",
          country: "India",
          postal_code: "600043"
        },
        billing_same_as_shipping: true
      }
    };

    expect(enquiryProductId(enquiry)).toBe("pixy-lr");
    expect(enquiryProductUrl(enquiry)).toBe("https://example.com/product/pixy-lr");
    expect(enquiryShippingAddress(enquiry)?.city).toBe("Chennai");
    expect(enquiryBillingAddress(enquiry)?.postalCode).toBe("600043");
    expect(formatEnquiryAddress(enquiryShippingAddress(enquiry))).toContain("Chennai");
  });
});

describe("product enquiry wiring", () => {
  it("wires product enquiry API, form, modal, and purchase actions", () => {
    const route = readFileSync(join(process.cwd(), "app/api/products/enquiry/route.ts"), "utf8");
    const form = readFileSync(join(process.cwd(), "components/product/product-enquiry-form.tsx"), "utf8");
    const modal = readFileSync(join(process.cwd(), "components/product/product-enquiry-modal.tsx"), "utf8");
    const configurator = readFileSync(join(process.cwd(), "sections/product/product-configurator.tsx"), "utf8");
    const enquiries = readFileSync(join(process.cwd(), "services/enquiries.ts"), "utf8");
    const adminQueue = readFileSync(join(process.cwd(), "components/admin/admin-enquiry-queue.tsx"), "utf8");

    expect(route).toContain("submitProductPageEnquiry");
    expect(route).toContain("createCustomerCheckoutNotificationRecord");
    expect(form).toContain("preferredContactMethod");
    expect(form).toContain("data-product-enquiry-form");
    expect(form).not.toContain("Shipping address");
    expect(form).not.toContain("billingSameAsShipping");
    expect(modal).toContain("ProductEnquiryForm");
    expect(modal).toContain("createPortal");
    expect(modal).toContain("document.body");
    expect(modal).toContain("data-product-enquiry-modal");
    expect(configurator).toContain("Send Enquiry");
    expect(configurator).toContain("ProductEnquiryModal");
    expect(enquiries).toContain('source: "product_page"');
    expect(enquiries).toContain("cart_lines");
    expect(enquiries).toContain("preferred_contact_method");
    expect(enquiries).toContain("shipping_address");
    expect(enquiries).toContain("billing_address");
    expect(adminQueue).toContain("enquiryShippingAddress");
    expect(adminQueue).toContain("Product ID");
  });
});
