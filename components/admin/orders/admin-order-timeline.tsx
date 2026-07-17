"use client";

import { OrderDetailSection } from "@/components/admin/orders/order-detail-primitives";
import { orderLongText, orderRadiusControl } from "@/components/admin/orders/order-layout-utils";
import { OrderStatusBadge } from "@/components/admin/orders/order-status-badge";
import { fullOrderTimeline, text, type AdminRow } from "@/components/admin/orders/order-view-helpers";

type AdminOrderTimelineProps = {
  order: AdminRow;
};

export function AdminOrderTimeline({ order }: AdminOrderTimelineProps) {
  const timeline = fullOrderTimeline(order);
  const defaultOpen = timeline.length < 5;

  return (
    <OrderDetailSection title="Timeline" collapsible defaultOpen={defaultOpen} dataAttribute="data-order-timeline">
      {timeline.length ? (
        <ol className="grid gap-2 border-l-2 border-[var(--platform-border)] pl-4">
          {timeline.map((entry, index) => {
            const eventLabel = text(entry.note) || text(entry.event, text(entry.summary, "Updated"));
            const eventAt = text(entry.at);
            return (
              <li
                key={`${text(entry.status, "status")}-${index}`}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2"
              >
                <span
                  className="mt-2.5 h-2 w-2 shrink-0 rounded-full border border-violet-400 bg-[var(--platform-surface)]"
                  aria-hidden
                />
                <div className={`min-w-0 border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 ${orderRadiusControl}`}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <OrderStatusBadge status={text(entry.status) || text(entry.event, "updated")} compact />
                    <span className={`platform-type-caption ${orderLongText}`}>
                      {eventAt ? eventAt.slice(0, 19).replace("T", " ") : "—"}
                    </span>
                  </div>
                  <p className={`mt-1.5 platform-type-body leading-relaxed text-[var(--platform-text-secondary)] ${orderLongText}`}>
                    {eventLabel}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="platform-type-body text-[var(--platform-text-muted)]">No timeline events yet.</p>
      )}
    </OrderDetailSection>
  );
}
