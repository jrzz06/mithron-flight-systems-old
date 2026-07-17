"use client";

import { orderMetadata, text, type AdminRow } from "@/components/admin/orders/order-view-helpers";
import { orderRadiusControl } from "@/components/admin/orders/order-layout-utils";

export function AdminOrderContactRequestBanner({
  order,
  itemCount
}: {
  order: AdminRow;
  itemCount: number;
}) {
  const sourceContactRequestId = text(order.source_contact_request_id)
    || text(orderMetadata(order).source_contact_request_id);
  if (!sourceContactRequestId) return null;

  const metadata = orderMetadata(order);
  const needsAddress = metadata.needs_address === true;
  const needsProducts = metadata.needs_products === true || itemCount === 0;
  if (!needsAddress && !needsProducts) return null;

  const subject = text(metadata.subject);
  const originalMessage = text(metadata.original_message);

  return (
    <section
      className={`border border-[var(--platform-accent)]/30 bg-[var(--platform-accent-soft)]/40 p-4 ${orderRadiusControl}`}
      data-contact-request-order-banner
    >
      <p className="platform-type-label font-medium text-[var(--platform-text-primary)]">
        From contact request
      </p>
      {subject ? (
        <p className="mt-1 platform-type-body text-[var(--platform-text-secondary)]">
          <span className="font-medium">Subject:</span> {subject}
        </p>
      ) : null}
      {originalMessage ? (
        <p className="mt-2 whitespace-pre-wrap platform-type-body text-[var(--platform-text-secondary)]">{originalMessage}</p>
      ) : null}
      <ul className="mt-2 list-disc space-y-1 pl-5 platform-type-body text-[var(--platform-text-secondary)]">
        {needsAddress ? <li>Add shipping address before fulfillment.</li> : null}
        {needsProducts ? <li>Add products before fulfillment.</li> : null}
      </ul>
    </section>
  );
}
