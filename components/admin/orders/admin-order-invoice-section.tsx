"use client";

import Link from "next/link";
import { OrderDetailSection, OrderField, OrderFieldGrid } from "@/components/admin/orders/order-detail-primitives";
import { text, type AdminRow } from "@/components/admin/orders/order-view-helpers";

type AdminOrderInvoiceSectionProps = {
  order: AdminRow;
  orderId: string;
};

export function AdminOrderInvoiceSection({ order, orderId }: AdminOrderInvoiceSectionProps) {
  const hasInvoice = Boolean(text(order.invoice_url));
  const status = hasInvoice
    ? "Generated"
    : text(order.payment_status) === "succeeded"
      ? "Pending generation"
      : "Not required";

  return (
    <OrderDetailSection title="Invoice">
      <OrderFieldGrid>
        <OrderField label="Status" value={status} />
        {hasInvoice ? (
          <OrderField
            label="Document"
            value={
              <Link
                href={`/admin/orders/invoice/${encodeURIComponent(orderId)}`}
                className="text-sm text-violet-300 hover:underline"
              >
                View / print invoice
              </Link>
            }
          />
        ) : (
          <OrderField label="Document" value="Available after payment verification." />
        )}
      </OrderFieldGrid>
    </OrderDetailSection>
  );
}
