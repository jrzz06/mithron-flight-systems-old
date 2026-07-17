import "server-only";

import { assertSupabaseAdminConfig } from "@/lib/env";
import { fetchAdminRecordsByColumn, updateAdminRecord } from "@/services/admin-actions";
import { buildInvoiceData } from "./build-invoice-data";
import { financialYearFromDate } from "./financial-year";
import { renderInvoiceHtmlDocument } from "./render-invoice-html";

type JsonRecord = Record<string, unknown>;

async function fetchExistingInvoice(orderId: string) {
  const config = assertSupabaseAdminConfig(process.env);
  const response = await fetch(
    `${config.url}/rest/v1/invoices?select=id,order_id,invoice_number&order_id=eq.${encodeURIComponent(orderId)}&limit=1`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      },
      cache: "no-store"
    }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as JsonRecord[];
  return rows[0] ?? null;
}

async function allocateInvoiceSerial(): Promise<number> {
  const config = assertSupabaseAdminConfig(process.env);
  const response = await fetch(`${config.url}/rest/v1/rpc/generate_invoice_serial`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: "{}",
    cache: "no-store"
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to allocate invoice serial: ${response.status}${text ? ` - ${text.slice(0, 200)}` : ""}`);
  }
  const serial = await response.json();
  const serialNumber = typeof serial === "number" ? serial : Number(serial);
  if (!Number.isFinite(serialNumber) || serialNumber <= 0) {
    throw new Error("Invalid invoice serial returned from database.");
  }
  return serialNumber;
}

async function insertInvoiceRecord(input: {
  orderId: string;
  serialNumber: number;
  financialYear: string;
  invoiceNumber: string;
  invoiceHtml: string;
}) {
  const config = assertSupabaseAdminConfig(process.env);
  const response = await fetch(`${config.url}/rest/v1/invoices`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      order_id: input.orderId,
      serial_number: input.serialNumber,
      financial_year: input.financialYear,
      invoice_number: input.invoiceNumber,
      invoice_html: input.invoiceHtml
    }),
    cache: "no-store"
  });

  if (response.status === 409) {
    return fetchExistingInvoice(input.orderId);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to store invoice: ${response.status}${text ? ` - ${text.slice(0, 200)}` : ""}`);
  }

  const rows = (await response.json()) as JsonRecord[];
  return rows[0] ?? null;
}

export async function generateAndStoreInvoice(orderId: string): Promise<{ invoiceNumber: string; invoiceUrl: string }> {
  const existing = await fetchExistingInvoice(orderId);
  if (existing) {
    const invoiceUrl = `/account/orders/${orderId}/invoice`;
    await updateAdminRecord(
      "orders",
      "id",
      orderId,
      { invoice_url: invoiceUrl, updated_at: new Date().toISOString() },
      null,
      process.env,
      { allowSystemActor: true }
    );
    return {
      invoiceNumber: String(existing.invoice_number ?? ""),
      invoiceUrl
    };
  }

  const orders = await fetchAdminRecordsByColumn("orders", "id", orderId);
  const order = orders[0];
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  const paidAt = new Date(String(order.updated_at ?? order.created_at ?? Date.now()));
  const serialNumber = await allocateInvoiceSerial();
  const invoiceData = await buildInvoiceData(orderId, serialNumber);
  const invoiceHtml = renderInvoiceHtmlDocument(invoiceData, { serialNumber });
  const financialYear = financialYearFromDate(paidAt);

  const stored = await insertInvoiceRecord({
    orderId,
    serialNumber,
    financialYear,
    invoiceNumber: invoiceData.invoiceNumber,
    invoiceHtml
  });

  const invoiceUrl = `/account/orders/${orderId}/invoice`;
  await updateAdminRecord(
    "orders",
    "id",
    orderId,
    { invoice_url: invoiceUrl, updated_at: new Date().toISOString() },
    null,
    process.env,
    { allowSystemActor: true }
  );

  return {
    invoiceNumber: String(stored?.invoice_number ?? invoiceData.invoiceNumber),
    invoiceUrl
  };
}

export async function getStoredInvoiceHtml(orderId: string): Promise<string | null> {
  const config = assertSupabaseAdminConfig(process.env);
  const response = await fetch(
    `${config.url}/rest/v1/invoices?select=invoice_html&order_id=eq.${encodeURIComponent(orderId)}&limit=1`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      },
      cache: "no-store"
    }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as JsonRecord[];
  const html = rows[0]?.invoice_html;
  return typeof html === "string" ? html : null;
}

export async function getStoredInvoiceRecord(orderId: string) {
  const config = assertSupabaseAdminConfig(process.env);
  const response = await fetch(
    `${config.url}/rest/v1/invoices?select=serial_number,invoice_number,invoice_html&order_id=eq.${encodeURIComponent(orderId)}&limit=1`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      },
      cache: "no-store"
    }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as JsonRecord[];
  return rows[0] ?? null;
}
