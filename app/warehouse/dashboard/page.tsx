import Link from "next/link";
import { ControlShell } from "@/components/admin/control-shell";
import { WarehouseDashboardLiveSync } from "@/components/warehouse/warehouse-dashboard-live-sync";
import { WarehouseKpiStrip } from "@/components/warehouse/warehouse-kpi-strip";
import { employeeFulfillmentLabel, RECEIVED_FULFILLMENT_STATUSES } from "@/lib/warehouse/operational-labels";
import { getWarehouseSnapshot } from "@/services/admin";
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

function isToday(value: unknown) {
  const raw = text(value, "");
  if (!raw || raw === "—") return false;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getUTCFullYear() === now.getUTCFullYear()
    && date.getUTCMonth() === now.getUTCMonth()
    && date.getUTCDate() === now.getUTCDate();
}

function orderMetadata(order: Record<string, unknown>) {
  const metadata = order.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function orderPriority(order: Record<string, unknown>) {
  const metadata = orderMetadata(order);
  const priority = text(metadata.priority, "");
  if (priority && priority !== "—") return priority;
  return "Standard";
}

function assignedEmployee(order: Record<string, unknown>) {
  const metadata = orderMetadata(order);
  return text(metadata.assigned_to ?? metadata.assigned_employee, "Unassigned");
}

export default async function WarehouseDashboardPage() {
  const [snapshot, policy, auth] = await Promise.all([
    getWarehouseSnapshot({ scope: "dashboard" }),
    getAdminSettingsPolicy(),
    getCurrentAuthContext()
  ]);
  const scope = await resolveWarehouseScope({ userId: auth.userId, role: auth.role });
  const scopedOrders = filterOrdersForWarehouseScope(snapshot.data.orders, scope, policy.defaultWarehouseCode);
  const ordersWaiting = scopedOrders.filter((order) => text(order.fulfillment_status, "pending") === "pending");
  const inFulfillment = scopedOrders.filter((order) =>
    RECEIVED_FULFILLMENT_STATUSES.includes(text(order.fulfillment_status, "pending") as typeof RECEIVED_FULFILLMENT_STATUSES[number])
  );
  const dispatchedToday = scopedOrders.filter((order) =>
    ["shipped", "delivered"].includes(text(order.fulfillment_status, "pending")) && isToday(order.updated_at)
  );

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
        <WarehouseDashboardLiveSync enabled={policy.realtimeUpdatesEnabled} />
        <WarehouseKpiStrip
          tiles={[
            { label: "Awaiting Receipt", value: ordersWaiting.length, href: "/warehouse/orders?fulfillment_status=pending" },
            { label: "In Fulfillment", value: inFulfillment.length, href: "/warehouse/fulfillment" },
            { label: "Dispatched Today", value: dispatchedToday.length, href: "/warehouse/activity" }
          ]}
        />

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
                  <th className="px-4 py-3 font-semibold">Priority</th>
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
                      <td className="px-4 py-3">{orderPriority(order)}</td>
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
                    <td colSpan={7} className="px-4 py-10 text-center text-[var(--platform-text-muted)]">
                      No orders are waiting for processing.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </ControlShell>
  );
}
