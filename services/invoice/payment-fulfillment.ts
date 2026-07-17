import "server-only";

import { mergePaymentLifecycleMetadata } from "@/lib/orders/payment-lifecycle";
import { generateAndStoreInvoice, getStoredInvoiceRecord } from "@/lib/invoice/generate-invoice";
import { fetchAdminRecordsByColumn, updateAdminRecord } from "@/services/admin-actions";
import { sendOrderConfirmationEmail } from "@/services/email/order-confirmation";
import { logPaymentEvent, logPaymentWarning } from "@/services/payments/logger";

type JsonRecord = Record<string, unknown>;

function readConfirmationEmailSentAt(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as JsonRecord).confirmation_email_sent_at;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export type PaidOrderFulfillment = {
  invoiceNumber: string;
  invoiceUrl: string;
  customerEmail: string;
  emailSent: boolean;
  emailSkipped: boolean;
  invoiceReady: boolean;
  total: number;
  orderNumber: string;
};

/**
 * Read invoice and email status for a paid order without generating anything.
 */
export async function getPaidOrderFulfillment(orderId: string): Promise<PaidOrderFulfillment | null> {
  const orders = await fetchAdminRecordsByColumn("orders", "id", orderId);
  const order = orders[0];
  if (!order) return null;

  const paymentStatus = String(order.payment_status ?? "");
  if (paymentStatus !== "succeeded") return null;

  const invoice = await getStoredInvoiceRecord(orderId);
  const baseMetadata =
    (order.metadata && typeof order.metadata === "object" ? order.metadata : {}) as JsonRecord;
  const alreadySent = readConfirmationEmailSentAt(baseMetadata);

  return {
    invoiceNumber: String(invoice?.invoice_number ?? ""),
    invoiceUrl: `/api/invoices/${orderId}`,
    customerEmail: String(order.customer_email ?? "").trim(),
    emailSent: Boolean(alreadySent),
    emailSkipped: false,
    invoiceReady: Boolean(invoice?.invoice_number),
    total: Number(order.total ?? 0),
    orderNumber: String(order.order_number ?? orderId)
  };
}

/**
 * Payment-verified event handler: generate GST invoice and send confirmation email.
 * Idempotent — safe to call from webhooks, verify API, and RPC skip paths.
 */
export async function fulfillOrderOnPaymentVerified(
  orderId: string,
  env: Record<string, string | undefined> = process.env
): Promise<PaidOrderFulfillment | null> {
  const orders = await fetchAdminRecordsByColumn("orders", "id", orderId);
  const order = orders[0];
  if (!order) return null;

  const paymentStatus = String(order.payment_status ?? "");
  if (paymentStatus !== "succeeded") return null;

  const customerEmail = String(order.customer_email ?? "").trim();
  const orderNumber = String(order.order_number ?? orderId);
  const total = Number(order.total ?? 0);
  const baseMetadata =
    (order.metadata && typeof order.metadata === "object" ? order.metadata : {}) as JsonRecord;

  let invoiceNumber = "";
  const invoiceUrl = `/api/invoices/${orderId}`;

  try {
    const invoice = await generateAndStoreInvoice(orderId);
    invoiceNumber = invoice.invoiceNumber;
    logPaymentEvent("order_invoice_generated", { orderId, invoiceNumber });
  } catch (invoiceError) {
    logPaymentWarning("order_invoice_generation_failed", {
      orderId,
      error: invoiceError instanceof Error ? invoiceError.message : String(invoiceError)
    });
  }

  let emailSent = false;
  let emailSkipped = false;
  const alreadySent = readConfirmationEmailSentAt(baseMetadata);

  if (customerEmail && !alreadySent) {
    try {
      const result = await sendOrderConfirmationEmail({
        orderId,
        order,
        invoiceNumber: invoiceNumber || undefined
      });
      emailSent = result.ok === true && result.skipped !== true;
      emailSkipped = result.skipped === true;

      if (emailSent) {
        await updateAdminRecord(
          "orders",
          "id",
          orderId,
          {
            metadata: {
              ...mergePaymentLifecycleMetadata(baseMetadata, {
                state: "PAYMENT_VERIFIED",
                note: "Order confirmation email sent."
              }),
              confirmation_email_sent_at: new Date().toISOString(),
              confirmation_email_to: customerEmail
            },
            updated_at: new Date().toISOString()
          },
          null,
          env,
          { allowSystemActor: true }
        );

        logPaymentEvent("order_confirmation_email_sent", { orderId, customerEmail });
      } else if (emailSkipped) {
        logPaymentWarning("order_confirmation_email_skipped", { orderId, customerEmail });
      }
    } catch (emailError) {
      logPaymentWarning("order_confirmation_email_failed", {
        orderId,
        error: emailError instanceof Error ? emailError.message : String(emailError)
      });
    }
  } else if (alreadySent) {
    emailSent = true;
  }

  return {
    invoiceNumber,
    invoiceUrl,
    customerEmail,
    emailSent,
    emailSkipped,
    invoiceReady: Boolean(invoiceNumber),
    total,
    orderNumber
  };
}
