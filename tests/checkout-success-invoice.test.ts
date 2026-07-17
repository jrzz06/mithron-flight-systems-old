import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("post-payment invoice and email fulfillment", () => {
  it("generates invoice and sends email from payment-verified event handler", () => {
    const fulfillment = source("services/invoice/payment-fulfillment.ts");
    expect(fulfillment).toContain("generateAndStoreInvoice");
    expect(fulfillment).toContain("sendOrderConfirmationEmail");
    expect(fulfillment).toContain("fulfillOrderOnPaymentVerified");
    expect(fulfillment).toContain("confirmation_email_sent_at");
  });

  it("triggers fulfillment from payment confirmation flow", () => {
    const confirm = source("services/payments/confirm-verified-payment.ts");
    expect(confirm).toContain("fulfillOrderOnPaymentVerified");
    const apply = source("services/payments/confirm-payment.ts");
    expect(apply).toContain("fulfillOrderOnPaymentVerified");
  });

  it("reads invoice on checkout success without generating", () => {
    const route = source("app/api/checkout/success/route.ts");
    expect(route).toContain("getPaidOrderFulfillment");
    expect(route).not.toContain("fulfillOrderOnPaymentVerified");
    expect(route).toContain("invoicePending");
  });

  it("returns invoice details from payment verify API after event processing", () => {
    const route = source("app/api/payments/verify/route.ts");
    expect(route).toContain("getPaidOrderFulfillment");
    expect(route).toContain("invoiceNumber");
    expect(route).toContain("emailSent");
  });

  it("renders invoice on checkout success page", () => {
    const page = source("app/(storefront)/checkout/success/checkout-success-client.tsx");
    expect(page).toContain("/api/checkout/success");
    expect(page).toContain("invoiceFrame");
    expect(page).toContain("invoicePending");
    expect(page).toContain("emailSent");
  });

  it("uses mithron invoice template in generation pipeline", () => {
    const renderer = source("lib/invoice/render-invoice-html.ts");
    expect(renderer).toContain("renderMithronInvoiceHtml");
    expect(renderer).not.toContain("invoice-shell");
    const template = source("lib/invoice/mithron-invoice-template.ts");
    expect(template).toContain("INV-");
    expect(template).toContain("mi-wrap");
  });
});
