import { ControlShell } from "@/components/admin/control-shell";
import { WarehouseOpsLiveSync } from "@/components/warehouse/warehouse-ops-live-sync";
import { employeeFulfillmentLabel } from "@/lib/warehouse/operational-labels";
import { formatOrderDate } from "@/lib/warehouse/order-helpers";
import { getWarehouseSnapshot } from "@/services/admin";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { getCurrentAuthContext } from "@/services/auth";
import { filterOrdersForWarehouseScope, resolveWarehouseScope } from "@/services/warehouse-scope";
import { connectivityMessage } from "@/lib/platform/copy";

export const dynamic = "force-dynamic";

function text(value: unknown, fallback = "—") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function trackingFromOrder(order: Record<string, unknown>) {
  const tracking = order.shipment_tracking;
  if (!tracking || typeof tracking !== "object" || Array.isArray(tracking)) {
    return { carrier: "—", trackingNumber: "—" };
  }
  const record = tracking as Record<string, unknown>;
  return {
    carrier: text(record.carrier, "—"),
    trackingNumber: text(record.tracking_number, "—")
  };
}

export default async function WarehouseActivityPage() {
  const [snapshot, policy, auth] = await Promise.all([
    getWarehouseSnapshot({ scope: "orders" }),
    getAdminSettingsPolicy(),
    getCurrentAuthContext()
  ]);
  const scope = await resolveWarehouseScope({ userId: auth.userId, role: auth.role });
  const scopedOrders = filterOrdersForWarehouseScope(snapshot.data.orders, scope, policy.defaultWarehouseCode);
  const dispatchedOrders = scopedOrders
    .filter((order) => ["shipped", "delivered"].includes(text(order.fulfillment_status, "pending")))
    .sort((left, right) => Date.parse(String(right.updated_at ?? "")) - Date.parse(String(left.updated_at ?? "")));

  return (
    <ControlShell
      eyebrow="History"
      title="Dispatch History"
      description={connectivityMessage(snapshot.blockedReason) || "Orders that have been dispatched from the warehouse."}
      actions={[
        { label: "Orders", href: "/warehouse/orders" },
        { label: "Fulfillment", href: "/warehouse/fulfillment" }
      ]}
    >
      <WarehouseOpsLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <section data-warehouse-activity-timeline className="grid gap-4">
        <div className="overflow-x-auto rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
          <table className="min-w-[960px] w-full border-collapse text-left text-sm">
            <thead className="border-b border-[var(--platform-border)] text-[11px] uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
              <tr>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Dispatched At</th>
                <th className="px-4 py-3 font-semibold">Carrier</th>
                <th className="px-4 py-3 font-semibold">Tracking #</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--platform-border)] text-[var(--platform-text-secondary)]">
              {dispatchedOrders.length ? dispatchedOrders.map((order) => {
                const tracking = trackingFromOrder(order);
                return (
                  <tr key={text(order.id, text(order.order_number))}>
                    <td className="px-4 py-3 font-medium text-[var(--platform-text-primary)]">{text(order.order_number, text(order.id))}</td>
                    <td className="px-4 py-3">{text(order.customer_email)}</td>
                    <td className="px-4 py-3">{formatOrderDate(order.updated_at)}</td>
                    <td className="px-4 py-3">{tracking.carrier}</td>
                    <td className="px-4 py-3 font-mono text-xs">{tracking.trackingNumber}</td>
                    <td className="px-4 py-3">{employeeFulfillmentLabel(text(order.fulfillment_status, "shipped"))}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[var(--platform-text-muted)]">
                    No dispatched orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </ControlShell>
  );
}
