import Link from "next/link";
import type { ReactNode } from "react";
import { AdminDashboardLiveSync } from "@/components/admin/admin-dashboard-live-sync";
import { StatusPill } from "@/components/platform";
import { connectivityMessage, relativeTimeLabel } from "@/lib/platform/copy";
import { formatDashboardCount, getAdminDashboardSnapshot } from "@/services/admin";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";

export const dynamic = "force-dynamic";

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function orderLabel(order: Record<string, unknown>) {
  return text(order.order_number) || text(order.id).slice(0, 8) || "Order";
}

export default async function AdminPage() {
  const [snapshot, policy] = await Promise.all([
    getAdminDashboardSnapshot(),
    getAdminSettingsPolicy()
  ]);
  const data = snapshot.data ?? {};
  const operationalCounts = data.operationalCounts ?? {
    ordersReceivedToday: { table: "orders.received_today", count: 0, status: "UNAVAILABLE" as const },
    pendingOrdersReview: { table: "orders.pending_review", count: 0, status: "UNAVAILABLE" as const },
    pushedToWarehouse: { table: "orders.warehouse", count: 0, status: "UNAVAILABLE" as const },
    dispatchedToday: { table: "orders.dispatched_today", count: 0, status: "UNAVAILABLE" as const }
  };

  const receivedToday = (data.ordersReceivedToday ?? []).slice(0, 8);
  const reviewOrders = (data.ordersNeedingReview ?? []).slice(0, 8);
  const warehouseOrders = (data.ordersPushedToWarehouse ?? []).slice(0, 8);
  const dispatchedToday = (data.ordersDispatchedToday ?? []).slice(0, 8);

  const kpiCards = [
    {
      label: "Orders received today",
      value: formatDashboardCount(operationalCounts.ordersReceivedToday),
      href: "/admin/orders",
      tone: "text-sky-300"
    },
    {
      label: "Pending review",
      value: formatDashboardCount(operationalCounts.pendingOrdersReview),
      href: "/admin/orders?queue=review",
      tone: "text-amber-300"
    },
    {
      label: "Pushed to warehouse",
      value: formatDashboardCount(operationalCounts.pushedToWarehouse),
      href: "/admin/orders?queue=warehouse",
      tone: "text-violet-300"
    },
    {
      label: "Dispatched today",
      value: formatDashboardCount(operationalCounts.dispatchedToday),
      href: "/admin/orders?queue=warehouse",
      tone: "text-emerald-300"
    }
  ];

  return (
    <div data-admin-dashboard className="grid gap-4">
      <AdminDashboardLiveSync enabled={policy.realtimeUpdatesEnabled} />

      {snapshot.blockedReason ? (
        <p className="rounded-[var(--platform-radius)] border border-[var(--platform-warning)]/20 bg-[var(--platform-warning-soft)] px-4 py-3 text-sm text-[var(--platform-warning)]">
          {connectivityMessage(snapshot.blockedReason)}
        </p>
      ) : null}

      <section data-admin-kpi-strip className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-4 py-3 transition hover:bg-[var(--platform-surface-raised)]"
          >
            <p className="type-meta font-medium uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">{card.label}</p>
            <p className={`mt-1 text-3xl font-semibold tabular-nums ${card.tone}`}>{card.value}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-4">
        <h2 className="type-meta font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Action queue</h2>

        <div className="grid gap-4 xl:grid-cols-2">
          <OrderQueuePanel
            title="Orders received today"
            href="/admin/orders"
            emptyLabel="No orders received today."
            orders={receivedToday}
            statusKey="status"
            timeKey="created_at"
            queue="all"
          />
          <OrderQueuePanel
            title="Pending review"
            href="/admin/orders?queue=review"
            emptyLabel="No orders need review."
            orders={reviewOrders}
            statusKey="status"
            timeKey="updated_at"
            queue="review"
          />
          <OrderQueuePanel
            title="Pushed to warehouse"
            href="/admin/orders?queue=warehouse"
            emptyLabel="No orders in warehouse fulfillment."
            orders={warehouseOrders}
            statusKey="fulfillment_status"
            timeKey="updated_at"
            queue="warehouse"
          />
          <OrderQueuePanel
            title="Dispatched today"
            href="/admin/orders?queue=warehouse"
            emptyLabel="No warehouse dispatches today."
            orders={dispatchedToday}
            statusKey="fulfillment_status"
            timeKey="updated_at"
            queue="warehouse"
          />
        </div>
      </section>
    </div>
  );
}

function OrderQueuePanel({
  title,
  href,
  emptyLabel,
  orders,
  statusKey,
  timeKey,
  queue
}: {
  title: string;
  href: string;
  emptyLabel: string;
  orders: Record<string, unknown>[];
  statusKey: "status" | "fulfillment_status";
  timeKey: "created_at" | "updated_at";
  queue: string;
}) {
  return (
    <QueuePanel title={title} href={href} emptyLabel={emptyLabel}>
      {orders.length ? (
        <table className="min-w-full text-sm">
          <thead className="border-b border-[var(--platform-border)] text-left type-meta uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Order</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={String(order.id)} className="border-b border-[var(--platform-border)] last:border-b-0">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/orders?order=${encodeURIComponent(orderLabel(order))}&queue=${encodeURIComponent(queue)}`}
                    className="font-medium text-[var(--platform-accent)]"
                  >
                    {orderLabel(order)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-[var(--platform-text-secondary)]">{text(order.customer_email, "—")}</td>
                <td className="px-3 py-2">
                  <StatusPill status={text(order[statusKey], statusKey === "fulfillment_status" ? "pending" : "pending")} />
                </td>
                <td className="px-3 py-2 text-xs text-[var(--platform-text-muted)]">
                  {relativeTimeLabel(text(order[timeKey]) || text(order.created_at))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </QueuePanel>
  );
}

function QueuePanel({
  title,
  href,
  emptyLabel,
  children
}: {
  title: string;
  href: string;
  emptyLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--platform-border)] px-3 py-2">
        <h3 className="text-sm font-medium text-[var(--platform-text-primary)]">{title}</h3>
        <Link href={href} className="text-xs font-medium text-[var(--platform-accent)]">View all</Link>
      </div>
      <div className="overflow-x-auto">
        {children ? children : <p className="px-3 py-4 text-sm text-[var(--platform-text-muted)]">{emptyLabel}</p>}
      </div>
    </div>
  );
}
