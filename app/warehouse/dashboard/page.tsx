import Link from "next/link";
import { Suspense } from "react";
import { ControlShell } from "@/components/admin/control-shell";
import { ControlPlaneContentLoading } from "@/components/ui/control-plane-content-loading";
import { WarehouseDashboardLiveSync } from "@/components/warehouse/warehouse-dashboard-live-sync";
import { WarehouseKpiStrip } from "@/components/warehouse/warehouse-kpi-strip";
import { employeeFulfillmentLabel, RECEIVED_FULFILLMENT_STATUSES } from "@/lib/warehouse/operational-labels";
import { getWarehouseDashboardOrderKpis, getWarehouseSnapshot } from "@/services/admin";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { getCurrentAuthContext } from "@/services/auth";
import {
  filterOrdersForWarehouseScope,
  resolveWarehouseScope
} from "@/services/warehouse-scope";

export const dynamic = "force-dynamic";

function text(value: unknown, fallback = "—") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function orderMetadata(order: Record<string, unknown>) {
  const metadata = order.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function assignedEmployee(order: Record<string, unknown>) {
  const metadata = orderMetadata(order);
  return text(metadata.assigned_to ?? metadata.assigned_employee, "Unassigned");
}

async function WarehouseDashboardKpis() {
  const authPromise = getCurrentAuthContext();
  const [policy, scope] = await Promise.all([
    getAdminSettingsPolicy(),
    authPromise.then((ctx) => resolveWarehouseScope({ userId: ctx.userId, role: ctx.role }))
  ]);
  const kpis = await getWarehouseDashboardOrderKpis({
    isGlobal: scope.isGlobal,
    warehouseCode: scope.warehouseCode,
    defaultWarehouseCode: policy.defaultWarehouseCode
  });

  return (
    <WarehouseKpiStrip
      tiles={[
        { label: "Received", value: kpis.received, href: "/warehouse/orders?fulfillment_status=pending" },
        { label: "Picking", value: kpis.picking, href: "/warehouse/fulfillment" },
        { label: "Dispatched Today", value: kpis.dispatchedToday, href: "/warehouse/activity" }
      ]}
    />
  );
}

async function WarehouseDashboardWorkQueue() {
  const authPromise = getCurrentAuthContext();
  const [snapshot, policy, scope] = await Promise.all([
    getWarehouseSnapshot({ scope: "dashboard", limit: 24 }),
    getAdminSettingsPolicy(),
    authPromise.then((ctx) => resolveWarehouseScope({ userId: ctx.userId, role: ctx.role }))
  ]);
  const scopedOrders = filterOrdersForWarehouseScope(snapshot.data.orders, scope, policy.defaultWarehouseCode);

  const itemsByOrder = new Map<string, number>();
  for (const item of snapshot.data.orderItems) {
    const orderId = text(item.order_id, "");
    if (!orderId) continue;
    itemsByOrder.set(orderId, (itemsByOrder.get(orderId) ?? 0) + Number(item.quantity ?? 0));
  }

  const workQueue = scopedOrders
    .filter((order) => {
      const step = text(order.fulfillment_status, "pending");
      return ["pending", ...RECEIVED_FULFILLMENT_STATUSES].includes(step);
    })
    .slice(0, 20);

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--platform-text-primary)]">Today&apos;s Work Queue</h2>
        <Link href="/warehouse/orders" className="text-xs font-medium text-[var(--platform-accent)] hover:underline">
          View all orders
        </Link>
      </div>
      <div className="overflow-x-auto rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
        <table className="min-w-[960px] w-full border-collapse text-left text-sm">
          <thead className="border-b border-[var(--platform-border)] text-[11px] uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
            <tr>
              <th className="px-4 py-3 font-semibold">Order</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Items</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Assigned To</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--platform-border)] text-[var(--platform-text-secondary)]">
            {workQueue.length ? workQueue.map((order) => {
              const orderId = text(order.id, "");
              const orderNumber = text(order.order_number, orderId);
              const step = text(order.fulfillment_status, "pending");
              return (
                <tr key={orderId}>
                  <td className="px-4 py-3 font-medium text-[var(--platform-text-primary)]">{orderNumber}</td>
                  <td className="px-4 py-3">{text(order.customer_email)}</td>
                  <td className="px-4 py-3">{String(itemsByOrder.get(orderId) ?? 0)}</td>
                  <td className="px-4 py-3">{employeeFulfillmentLabel(step)}</td>
                  <td className="px-4 py-3">{assignedEmployee(order)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/warehouse/fulfillment/${orderId}`}
                      className="inline-flex min-h-8 items-center rounded-md border border-[var(--platform-border)] px-3 text-xs font-semibold text-[var(--platform-text-primary)] transition hover:border-[var(--platform-accent)]/40"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[var(--platform-text-muted)]">
                  No orders are waiting for processing.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function WarehouseDashboardRealtimeFlag() {
  const policy = await getAdminSettingsPolicy();
  return <WarehouseDashboardLiveSync enabled={policy.realtimeUpdatesEnabled} />;
}

export default function WarehouseDashboardPage() {
  return (
    <ControlShell
      eyebrow=""
      title="Today's Operations"
      description="Daily overview of orders waiting, in fulfillment, and dispatched today."
      actions={[
        { label: "Orders", href: "/warehouse/orders" },
        { label: "Fulfillment", href: "/warehouse/fulfillment" },
        { label: "History", href: "/warehouse/activity" }
      ]}
    >
      <section data-warehouse-operational-dashboard className="grid gap-6">
        <Suspense fallback={null}>
          <WarehouseDashboardRealtimeFlag />
        </Suspense>
        <Suspense
          fallback={
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-busy="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="platform-loading-pulse h-[4.5rem] rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]"
                />
              ))}
            </div>
          }
        >
          <WarehouseDashboardKpis />
        </Suspense>
        <Suspense fallback={<ControlPlaneContentLoading label="Loading work queue" />}>
          <WarehouseDashboardWorkQueue />
        </Suspense>
      </section>
    </ControlShell>
  );
}
