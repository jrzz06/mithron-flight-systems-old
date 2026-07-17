import "server-only";

import { computeOrderTotal, roundInr, sumInr } from "@/lib/currency";
import { getProductTaxGroup } from "@/lib/product-tax-groups";
import { resolveOrderAddresses } from "@/lib/addresses/resolve-server";
import { toAbsoluteUrl } from "@/lib/site-url";
import { fetchAdminRecordsByColumn } from "@/services/admin-actions";
import { MITHRON_COMPANY } from "./constants";
import { buildTemplateInvoiceNumber, financialYearFromDate, formatInvoiceDate } from "./financial-year";
import type { InvoiceData, InvoiceGstSummaryRow, InvoiceLineItem } from "./types";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function buildGstSummary(lineItems: InvoiceLineItem[]): InvoiceGstSummaryRow[] {
  const map = new Map<number, InvoiceGstSummaryRow>();
  for (const item of lineItems) {
    if (item.taxRate <= 0) continue;
    const existing = map.get(item.taxRate) ?? { taxRate: item.taxRate, taxableBase: 0, taxAmount: 0 };
    existing.taxableBase = roundInr(sumInr([existing.taxableBase, item.taxableBase]));
    existing.taxAmount = roundInr(sumInr([existing.taxAmount, item.taxAmount]));
    map.set(item.taxRate, existing);
  }
  return [...map.values()].sort((a, b) => a.taxRate - b.taxRate);
}

function mapLineItems(items: JsonRecord[]): InvoiceLineItem[] {
  return items.map((item) => {
    const metadata = asRecord(item.metadata);
    const taxGroup = typeof metadata.tax_group === "string" ? metadata.tax_group : null;
    const taxRate = Number(metadata.tax_rate ?? 0);
    const taxableBase = Number(metadata.taxable_base ?? item.line_total ?? 0);
    const taxAmount = Number(metadata.tax_amount ?? 0);
    const lineTotal = Number(item.line_total ?? taxableBase + taxAmount);
    return {
      description: String(item.product_name ?? item.product_slug ?? "Product"),
      sku: String(item.sku ?? item.product_slug ?? "—"),
      quantity: Number(item.quantity ?? 1),
      unitPrice: Number(item.unit_price ?? 0),
      taxableBase,
      taxRate,
      taxAmount,
      lineTotal,
      taxGroupLabel: getProductTaxGroup(taxGroup).label
    };
  });
}

export async function buildInvoiceData(orderId: string, serialNumber: number): Promise<InvoiceData> {
  const orders = await fetchAdminRecordsByColumn("orders", "id", orderId);
  const order = orders[0];
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  const items = await fetchAdminRecordsByColumn("order_items", "order_id", orderId);
  const payments = await fetchAdminRecordsByColumn("payments", "order_id", orderId);
  const payment = payments.find((row) => String(row.status ?? "") === "succeeded") ?? payments[0];

  const metadata = asRecord(order.metadata);
  const userId = typeof order.created_by_user_id === "string" ? order.created_by_user_id : null;
  const { billingAddressLines, shippingAddressLines } = await resolveOrderAddresses(metadata, userId, process.env, order);

  const lineItems = mapLineItems(items);
  const subtotal = sumInr(lineItems.map((item) => item.taxableBase));
  const taxTotal = sumInr(lineItems.map((item) => item.taxAmount));
  const shippingCharge = roundInr(Number(metadata.shipping_charge ?? 0));
  const discountTotal = roundInr(Number(metadata.discount_total ?? 0));
  const grandTotal = roundInr(
    Number(order.total) || computeOrderTotal({ subtotal, taxTotal, shipping: shippingCharge, discount: discountTotal })
  );

  const paidAt = payment?.verified_at ? new Date(String(payment.verified_at)) : new Date(String(order.created_at ?? Date.now()));
  const financialYear = financialYearFromDate(paidAt);
  const invoiceNumber = buildTemplateInvoiceNumber(financialYear, serialNumber);
  const dueDate = new Date(paidAt);
  dueDate.setUTCDate(dueDate.getUTCDate() + 30);

  return {
    invoiceNumber,
    financialYear,
    invoiceDate: formatInvoiceDate(paidAt),
    dueDate: formatInvoiceDate(dueDate),
    orderId,
    orderNumber: String(order.order_number ?? orderId),
    paymentId: String(payment?.provider_payment_id ?? payment?.provider_intent_id ?? "—"),
    transactionId: String(payment?.provider_intent_id ?? payment?.id ?? "—"),
    paymentProvider: String(payment?.provider ?? metadata.payment_provider ?? "—"),
    customer: {
      name: String(metadata.customer_full_name ?? "Customer"),
      email: String(order.customer_email ?? ""),
      phone: String(metadata.customer_phone ?? ""),
      company: typeof metadata.customer_company === "string" ? metadata.customer_company : undefined,
      gstin: typeof metadata.customer_gstin === "string" ? metadata.customer_gstin : undefined
    },
    billingAddress: { lines: billingAddressLines },
    shippingAddress: { lines: shippingAddressLines },
    lineItems,
    gstSummary: buildGstSummary(lineItems),
    subtotal: roundInr(subtotal),
    taxTotal: roundInr(taxTotal),
    shippingCharge,
    discountTotal,
    grandTotal,
    paymentMethod: String(payment?.provider ?? "Online"),
    paymentStatus: String(payment?.status ?? order.payment_status ?? "pending"),
    companyGstin: MITHRON_COMPANY.gstin,
    companyName: MITHRON_COMPANY.name,
    companyAddress: [...MITHRON_COMPANY.addressLines],
    supportEmail: MITHRON_COMPANY.supportEmail,
    supportPhone: MITHRON_COMPANY.supportPhone,
    logoUrl: toAbsoluteUrl("/favicon.svg")
  };
}
