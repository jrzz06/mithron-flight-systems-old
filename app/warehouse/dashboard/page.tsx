import Link from "next/link";
import { Suspense } from "react";
import { ControlShell } from "@/components/admin/control-shell";
import { ControlPlaneContentLoading } from "@/components/ui/control-plane-content-loading";
import { WarehouseDashboardLiveSync } from "@/components/warehouse/warehouse-dashboard-live-sync";
import { WarehouseDashboardRefreshButton } from "@/components/warehouse/warehouse-dashboard-refresh-button";
import { WarehouseKpiStrip } from "@/components/warehouse/warehouse-kpi-strip";
import { WarehouseOpenOrderLink } from "@/components/warehouse/warehouse-open-order-link";
import { employeeFulfillmentLabel } from "@/lib/warehouse/operational-labels";
import { formatOrderDate } from "@/lib/warehouse/order-helpers";
import { getWarehouseDashboardOrderKpis } from "@/services/admin";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { getCurrentAuthContext } from "@/services/auth";
import { listWarehouseDashboardOpenOrders } from "@/services/warehouse-ops-queries";
import { resolveWarehouseScope } from "@/services/warehouse-scope";

export const dynamic = "force-dynamic";

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

  if (!kpis.available) {
    return (
      <p
        role="status"
        className="rounded-[var(--platform-radius)] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      >
        Counts temporarily unavailable. Live updates will retry when the connection recovers.
      </p>
    );
  }

  return (
    <WarehouseKpiStrip
      tiles={[
        { label: "Received today", value: kpis.receivedToday, href: "/warehouse/orders" },
        { label: "Pending", value: kpis.pending, href: "/warehouse/orders" },
        { label: "Dispatched today", value: kpis.dispatchedToday, href: "/warehouse/activity" }
      ]}
    />
  );
}

async function WarehouseDashboardOpenList() {
  const authPromise = getCurrentAuthContext();
  const [policy, scope] = await Promise.all([
    getAdminSettingsPolicy(),
    authPromise.then((ctx) => resolveWarehouseScope({ userId: ctx.userId, role: ctx.role }))
  ]);
  const list = await listWarehouseDashboardOpenOrders({
    scope,
    defaultWarehouseCode: policy.defaultWarehouseCode
  });

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--platform-text-primary)]">Open orders</h2>
        <div className="flex flex-wrap items-center gap-2">
          <WarehouseDashboardRefreshButton />
          <a href="/warehouse/dashboard/export" className="platform-btn-secondary platform-btn-sm">
            Download Excel
          </a>
          <Link href="/warehouse/orders" className="text-xs font-medium text-[var(--platform-accent)] hover:underline">
            View all orders
          </Link>
        </div>
      </div>
      {!list.available ? (
        <p
          role="status"
          className="rounded-[var(--platform-radius)] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          Order list temporarily unavailable{list.blockedReason ? `: ${list.blockedReason}` : "."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
          <table className="min-w-[720px] w-full border-collapse text-left text-sm">
            <thead className="border-b border-[var(--platform-border)] type-meta uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
              <tr>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">Received</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--platform-border)] text-[var(--platform-text-secondary)]">
              {list.rows.length ? list.rows.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3 font-medium text-[var(--platform-text-primary)]">{order.orderNumber}</td>
                  <td className="px-4 py-3">{order.customerName}</td>
                  <td className="px-4 py-3">{order.customerPhone}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatOrderDate(order.createdAt)}</td>
                  <td className="px-4 py-3">{employeeFulfillmentLabel(order.fulfillmentStatus)}</td>
                  <td className="px-4 py-3">
                    <WarehouseOpenOrderLink orderId={order.id} />
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[var(--platform-text-muted)]">
                    No open orders right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
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
      description="Orders received today, pending queue, and dispatched today — live from the warehouse database."
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
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
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
        <Suspense fallback={<ControlPlaneContentLoading label="Loading open orders" />}>
          <WarehouseDashboardOpenList />
        </Suspense>
      </section>
    </ControlShell>
  );
}
