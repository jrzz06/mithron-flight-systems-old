import { ControlShell } from "@/components/admin/control-shell";
import { OperationalFeedback } from "@/components/admin/module-panel";
import { WarehouseOpsLiveSync } from "@/components/warehouse/warehouse-ops-live-sync";
import { employeeFulfillmentLabel } from "@/lib/warehouse/operational-labels";
import { formatOrderDate } from "@/lib/warehouse/order-helpers";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { getCurrentAuthContext } from "@/services/auth";
import { listWarehouseHistoryOrders } from "@/services/warehouse-ops-queries";
import { resolveWarehouseScope } from "@/services/warehouse-scope";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function WarehouseActivityPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const operationStatus = searchValue(params, "operation_status");
  const operationMessage = searchValue(params, "operation_message");

  const authPromise = getCurrentAuthContext();
  const [policy, scope] = await Promise.all([
    getAdminSettingsPolicy(),
    authPromise.then((auth) => resolveWarehouseScope({ userId: auth.userId, role: auth.role }))
  ]);

  const history = await listWarehouseHistoryOrders({
    scope,
    defaultWarehouseCode: policy.defaultWarehouseCode
  });

  return (
    <ControlShell
      eyebrow="History"
      title="Dispatch History"
      description="All dispatched orders from this warehouse."
      actions={[
        { label: "Orders", href: "/warehouse/orders" },
        { label: "Fulfillment", href: "/warehouse/fulfillment" }
      ]}
    >
      <WarehouseOpsLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <section data-warehouse-activity-timeline className="grid gap-4">
        <OperationalFeedback
          status={operationStatus}
          message={operationMessage}
          context="Dispatch"
          idle="Dispatched orders appear here after confirm."
        />
        {!history.available ? (
          <p
            role="status"
            className="rounded-[var(--platform-radius)] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          >
            History temporarily unavailable{history.blockedReason ? `: ${history.blockedReason}` : "."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
            <table className="min-w-[960px] w-full border-collapse text-left text-sm">
              <thead className="border-b border-[var(--platform-border)] type-meta uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Dispatched at</th>
                  <th className="px-4 py-3 font-semibold">Carrier</th>
                  <th className="px-4 py-3 font-semibold">Tracking #</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--platform-border)] text-[var(--platform-text-secondary)]">
                {history.rows.length ? history.rows.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-3 font-medium text-[var(--platform-text-primary)]">{order.orderNumber}</td>
                    <td className="px-4 py-3">{order.customerName}</td>
                    <td className="px-4 py-3">{order.customerPhone}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatOrderDate(order.updatedAt)}</td>
                    <td className="px-4 py-3">{order.carrier}</td>
                    <td className="px-4 py-3 font-mono text-xs">{order.trackingNumber}</td>
                    <td className="px-4 py-3">{employeeFulfillmentLabel(order.fulfillmentStatus)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-[var(--platform-text-muted)]">
                      No dispatched orders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </ControlShell>
  );
}
