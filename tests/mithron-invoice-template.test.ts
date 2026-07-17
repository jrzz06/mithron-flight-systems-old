import { describe, expect, it } from "vitest";
import { mapInvoiceDataToTemplate } from "@/lib/invoice/map-to-template-input";
import { inr, renderMithronInvoiceHtml, toWords } from "@/lib/invoice/mithron-invoice-template";
import { renderInvoiceHtmlDocument } from "@/lib/invoice/render-invoice-html";
import { buildTemplateInvoiceNumber } from "@/lib/invoice/financial-year";
import type { InvoiceData } from "@/lib/invoice/types";

const sampleInvoiceData: InvoiceData = {
  invoiceNumber: "INV-00001/26-27",
  financialYear: "26-27",
  invoiceDate: "27-06-2026",
  dueDate: "27-07-2026",
  orderId: "order-1",
  orderNumber: "ORD-TEST-001",
  paymentId: "pay_123",
  transactionId: "txn_123",
  paymentProvider: "razorpay",
  customer: {
    name: "Test Customer",
    email: "test@example.com",
    phone: "+91 9000000000",
    gstin: "33AAAAA0000A1Z5"
  },
  billingAddress: {
    lines: ["12 Main Street", "Chennai – 600043", "Tamil Nadu, India"]
  },
  shippingAddress: {
    lines: ["Warehouse Lane 4", "Chennai – 600100", "Tamil Nadu, India"]
  },
  lineItems: [
    {
      description: "Guru Student Drone",
      sku: "GSD-001",
      quantity: 1,
      unitPrice: 29999,
      taxableBase: 29999,
      taxRate: 18,
      taxAmount: 5399.82,
      lineTotal: 35398.82,
      taxGroupLabel: "GST 18%"
    }
  ],
  gstSummary: [{ taxRate: 18, taxableBase: 29999, taxAmount: 5399.82 }],
  subtotal: 29999,
  taxTotal: 5399.82,
  shippingCharge: 0,
  discountTotal: 0,
  grandTotal: 35398.82,
  paymentMethod: "razorpay",
  paymentStatus: "succeeded",
  companyGstin: "33AAQCM2390E1ZG",
  companyName: "Mithron India smart services private limited",
  companyAddress: ["Chennai, Tamil Nadu, India"],
  supportEmail: "anitha@mithronsmart.com",
  supportPhone: "+91 8861304108"
};

describe("mithron invoice template", () => {
  it("builds INV invoice numbers", () => {
    expect(buildTemplateInvoiceNumber("26-27", 1)).toBe("INV-00001/26-27");
  });

  it("maps order invoice data into template input", () => {
    const mapped = mapInvoiceDataToTemplate(sampleInvoiceData, 1);
    expect(mapped.serial).toBe("00001");
    expect(mapped.customer.name).toBe("Test Customer");
    expect(mapped.items[0]?.desc).toContain("Guru Student Drone");
    expect(mapped.items[0]?.rate).toBe(29999);
    expect(mapped.paymentMade).toBeNull();
  });

  it("adds shipping and discount as synthetic lines", () => {
    const mapped = mapInvoiceDataToTemplate(
      {
        ...sampleInvoiceData,
        shippingCharge: 200,
        discountTotal: 100
      },
      2
    );
    expect(mapped.items.some((item) => item.desc === "Shipping charges")).toBe(true);
    expect(mapped.items.some((item) => item.desc === "Discount" && item.rate === -100)).toBe(true);
  });

  it("renders template markers and CGST/SGST columns", () => {
    const html = renderMithronInvoiceHtml(mapInvoiceDataToTemplate(sampleInvoiceData, 1));
    expect(html).toContain('class="mi-wrap"');
    expect(html).toContain("mi-header");
    expect(html).toContain("mi-table");
    expect(html).toContain("mi-footer");
    expect(html).toContain("TAX INVOICE");
    expect(html).toContain("CGST");
    expect(html).toContain("SGST");
    expect(html).toMatch(/INV-\d{5}\/26-27/);
    expect(html).not.toContain("invoice-shell");
  });

  it("formats INR and amount in words like the original generator", () => {
    expect(inr(35398.82)).toBe("35,398.82");
    expect(toWords(35399)).toContain("Indian Rupee");
    expect(toWords(35399)).toContain("Only");
  });

  it("delegates renderInvoiceHtmlDocument to the mithron template", () => {
    const html = renderInvoiceHtmlDocument(sampleInvoiceData, { serialNumber: 1 });
    expect(html).toContain("mi-wrap");
    expect(html).toContain("Print / Save PDF");
    expect(html).not.toContain("invoice-shell");
  });
});
