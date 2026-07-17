import { formatINR } from "@/lib/utils";
import { toAbsoluteUrl } from "@/lib/site-url";
import { MITHRON_COMPANY } from "@/lib/invoice/constants";
import type { InvoiceData } from "@/lib/invoice/types";

export function buildOrderConfirmationEmailHtml(input: {
  orderNumber: string;
  orderId: string;
  customerName: string;
  invoiceNumber?: string;
  lineItems: Array<{ description: string; quantity: number; lineTotal: number }>;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  paymentMethod: string;
  shippingAddressLines?: string[];
  billingAddressLines?: string[];
}) {
  const invoiceUrl = toAbsoluteUrl(`/account/orders/${input.orderId}/invoice`);
  const shippingBlock = input.shippingAddressLines?.length
    ? `<p style="margin:0 0 8px;"><strong>Ship to:</strong><br>${input.shippingAddressLines.join("<br>")}</p>`
    : "";
  const billingBlock = input.billingAddressLines?.length
    ? `<p style="margin:0 0 18px;"><strong>Bill to:</strong><br>${input.billingAddressLines.join("<br>")}</p>`
    : "";
  const rows = input.lineItems
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">${item.description}</td>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;">${formatINR(item.lineTotal)}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:24px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="padding:24px 28px;background:#0f172a;color:#ffffff;">
      <h1 style="margin:0;font-size:20px;">${MITHRON_COMPANY.name}</h1>
      <p style="margin:8px 0 0;font-size:13px;opacity:0.85;">Payment confirmed for order ${input.orderNumber}</p>
    </div>
    <div style="padding:24px 28px;">
      <p style="margin:0 0 12px;">Hi ${input.customerName},</p>
      <p style="margin:0 0 18px;line-height:1.6;">Thank you for your order. Your payment has been verified and your GST invoice is ready.</p>
      ${input.invoiceNumber ? `<p style="margin:0 0 18px;"><strong>Invoice:</strong> ${input.invoiceNumber}</p>` : ""}
      ${shippingBlock}
      ${billingBlock}
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr>
            <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #e2e8f0;">Item</th>
            <th style="text-align:center;padding-bottom:8px;border-bottom:2px solid #e2e8f0;">Qty</th>
            <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #e2e8f0;">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:16px;font-size:14px;line-height:1.8;">
        <div>Subtotal: ${formatINR(input.subtotal)}</div>
        <div>GST: ${formatINR(input.taxTotal)}</div>
        <div><strong>Grand Total: ${formatINR(input.grandTotal)}</strong></div>
        <div>Payment method: ${input.paymentMethod}</div>
      </div>
      <p style="margin:24px 0 0;">
        <a href="${invoiceUrl}" style="display:inline-block;background:#1f6b46;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">View / Print Invoice</a>
      </p>
      <p style="margin:24px 0 0;font-size:13px;color:#64748b;line-height:1.6;">
        Need help? Contact ${MITHRON_COMPANY.supportEmail} or ${MITHRON_COMPANY.supportPhone}.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function buildOrderConfirmationEmailFromInvoice(data: InvoiceData, orderId: string) {
  return buildOrderConfirmationEmailHtml({
    orderNumber: data.orderNumber,
    orderId,
    customerName: data.customer.name,
    invoiceNumber: data.invoiceNumber,
    lineItems: data.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      lineTotal: item.lineTotal
    })),
    subtotal: data.subtotal,
    taxTotal: data.taxTotal,
    grandTotal: data.grandTotal,
    paymentMethod: data.paymentMethod,
    shippingAddressLines: data.shippingAddress.lines,
    billingAddressLines: data.billingAddress.lines
  });
}
