import "server-only";

import { getStoredInvoiceRecord } from "@/lib/invoice/generate-invoice";
import { buildInvoiceData } from "@/lib/invoice/build-invoice-data";
import { sendEmail } from "@/services/email/resend";
import { buildOrderConfirmationEmailFromInvoice } from "@/services/email/templates/order-confirmation-email";

type JsonRecord = Record<string, unknown>;

export async function sendOrderConfirmationEmail(input: {
  orderId: string;
  order: JsonRecord;
  invoiceNumber?: string;
}) {
  const customerEmail = typeof input.order.customer_email === "string" ? input.order.customer_email.trim() : "";
  if (!customerEmail) return { ok: false, skipped: true };

  const stored = await getStoredInvoiceRecord(input.orderId);
  const serialNumber = Number(stored?.serial_number ?? 1);
  const invoiceData = await buildInvoiceData(input.orderId, serialNumber);
  if (input.invoiceNumber) {
    invoiceData.invoiceNumber = input.invoiceNumber;
  } else if (typeof stored?.invoice_number === "string") {
    invoiceData.invoiceNumber = stored.invoice_number;
  }

  const html = buildOrderConfirmationEmailFromInvoice(invoiceData, input.orderId);

  return sendEmail({
    to: customerEmail,
    subject: `Payment confirmed — Order ${String(input.order.order_number ?? input.orderId)}`,
    html
  });
}
