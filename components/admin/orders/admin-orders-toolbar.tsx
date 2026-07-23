"use client";

import Link from "next/link";
import {
  ADMIN_ORDERS_VIEW_TABS,
  buildOrdersUrl,
  orderMatchesViewQueue,
  viewQueueTabKey,
  type AdminRow
} from "@/components/admin/orders/order-view-helpers";
import { orderLongText, orderRadiusControl } from "@/components/admin/orders/order-layout-utils";

type AdminOrdersToolbarProps = {
  orders: AdminRow[];
  queue: string;
  selectedKey: string;
  filtersQuery: string;
  sort: string;
  snapshotLimitWarning?: string | null;
};

export function AdminOrdersToolbar({
  orders,
  queue,
  selectedKey,
  filtersQuery,
  sort,
  snapshotLimitWarning
}: AdminOrdersToolbarProps) {
  const activeTab = viewQueueTabKey(queue);
  const queueCounts = ADMIN_ORDERS_VIEW_TABS.map((entry) => ({
    ...entry,
    count: orders.filter((order) => orderMatchesViewQueue(order, entry.key)).length
  }));

  return (
    <div className="grid gap-2">
      {snapshotLimitWarning ? (
        <p
          role="status"
          className="rounded-[8px] border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100"
        >
          {snapshotLimitWarning}
        </p>
      ) : null}
      <nav
        data-order-status-board
        data-booking-workflow-board
        aria-label="Order status"
        className="flex flex-nowrap gap-2 overflow-x-auto"
      >
        {queueCounts.map((entry) => {
          const active = activeTab === entry.key;
          return (
            <Link
              key={entry.key}
              href={buildOrdersUrl({
                queue: entry.key,
                order: selectedKey || undefined,
                q: filtersQuery || undefined,
                sort: sort !== "newest" ? sort : undefined
              })}
              className={`inline-flex h-10 min-w-0 max-w-full items-center gap-2 border px-3 text-sm font-medium transition ${orderRadiusControl} ${orderLongText} ${
                active
                  ? "border-violet-500/50 bg-violet-500/10 text-violet-100"
                  : "border-[var(--platform-border)] bg-[var(--platform-surface-muted)] text-[var(--platform-text-secondary)] hover:border-[var(--platform-border-strong)]"
              }`}
            >
              {entry.label}
              <span className={`rounded px-1.5 py-0.5 type-badge ${active ? "bg-violet-500/20" : "bg-[var(--platform-surface)]"}`}>
                {entry.count}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
