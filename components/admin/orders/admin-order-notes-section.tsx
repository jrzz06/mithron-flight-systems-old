"use client";

import { OrderDetailSection } from "@/components/admin/orders/order-detail-primitives";
import { orderMetadata, text, type AdminRow } from "@/components/admin/orders/order-view-helpers";

type AdminOrderNotesSectionProps = {
  order: AdminRow;
};

export function AdminOrderNotesSection({ order }: AdminOrderNotesSectionProps) {
  const note = text(orderMetadata(order).internal_note);
  if (!note) return null;

  return (
    <OrderDetailSection title="Internal notes">
      <p className="whitespace-pre-wrap platform-type-body leading-relaxed text-[var(--platform-text-secondary)]">{note}</p>
    </OrderDetailSection>
  );
}
