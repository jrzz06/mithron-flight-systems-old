import "server-only";

import { roundInr } from "@/lib/currency";
import { formatInvoiceSerial } from "./financial-year";
import type { MithronInvoiceInput } from "./mithron-invoice-template";
import type { InvoiceData } from "./types";

function exGstRate(item: InvoiceData["lineItems"][number]) {
  if (item.quantity > 0 && item.taxableBase > 0) {
    return roundInr(item.taxableBase / item.quantity);
  }
  return item.unitPrice;
}

function mapLineItem(item: InvoiceData["lineItems"][number]) {
  const skuSuffix = item.sku && item.sku !== "—" ? ` (SKU: ${item.sku})` : "";
  return {
    desc: `${item.description}${skuSuffix}`,
    qty: item.quantity,
    unit: "",
    rate: exGstRate(item),
    gstPct: item.taxRate
  };
}

export function mapInvoiceDataToTemplate(invoiceData: InvoiceData, serialNumber: number): MithronInvoiceInput {
  const items = invoiceData.lineItems.map(mapLineItem);

  if (invoiceData.shippingCharge > 0) {
    items.push({
      desc: "Shipping charges",
      qty: 1,
      unit: "",
      rate: invoiceData.shippingCharge,
      gstPct: 18
    });
  }

  if (invoiceData.discountTotal > 0) {
    items.push({
      desc: "Discount",
      qty: 1,
      unit: "",
      rate: -invoiceData.discountTotal,
      gstPct: 0
    });
  }

  const customerName =
    invoiceData.customer.name.trim() ||
    invoiceData.customer.company?.trim() ||
    "Customer";

  const paymentMade =
    invoiceData.paymentStatus === "succeeded" ? null : invoiceData.grandTotal;

  return {
    serial: formatInvoiceSerial(serialNumber),
    financialYr: invoiceData.financialYear,
    date: invoiceData.invoiceDate,
    dueDate: invoiceData.dueDate,
    customer: {
      name: customerName,
      gstin: invoiceData.customer.gstin,
      billTo: invoiceData.billingAddress.lines,
      shipTo: invoiceData.shippingAddress.lines
    },
    items,
    paymentMade,
    grandTotal: invoiceData.grandTotal
  };
}
