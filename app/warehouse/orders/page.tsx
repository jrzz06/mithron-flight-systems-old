import { ControlShell } from "@/components/admin/control-shell";
import { OperationalFeedback } from "@/components/admin/module-panel";
import { WarehouseKpiStrip } from "@/components/warehouse/warehouse-kpi-strip";
import { WarehouseOpsLiveSync } from "@/components/warehouse/warehouse-ops-live-sync";
import { WarehouseOrderQueueTable } from "@/components/warehouse/warehouse-order-queue-table";
import {
  ORDER_STEP_FILTER_OPTIONS,
  RECEIVED_FULFILLMENT_STATUSES,
  matchesEmployeeFulfillmentFilter
} from "@/lib/warehouse/operational-labels";
import {
  buildWarehouseOrderRow,
  type WarehouseOrderRow
} from "@/lib/warehouse/order-helpers";
import { isActionNavigationError } from "@/lib/server-action-errors";
import { getWarehouseSnapshot } from "@/services/admin";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { getCurrentAuthContext } from "@/services/auth";
import { filterOrdersForWarehouseScope, resolveWarehouseScope } from "@/services/warehouse-scope";
import { cancelWarehouseOrderFormAction, dispatchWarehouseOrderFormAction } from "../actions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function feedbackPath(status: "success" | "error", message: string) {
  return `/warehouse/orders?operation_status=${status}&operation_message=${encodeURIComponent(message)}`;
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "The order action failed.";
}

async function cancelOrderWithFeedback(formData: FormData) {
  "use server";
  try {
    await cancelWarehouseOrderFormAction(formData);
  } catch (error) {
    if (isActionNavigationError(error)) throw error;
    redirect(feedbackPath("error", messageFromError(error)));
  }
  redirect(feedbackPath("success", "Order cancelled."));
}

async function dispatchOrderWithFeedback(formData: FormData) {
  "use server";
  try {
    await dispatchWarehouseOrderFormAction(formData);
  } catch (error) {
    if (isActionNavigationError(error)) throw error;
    redirect(feedbackPath("error", messageFromError(error)));
  }
  redirect(feedbackPath("success", "Order dispatched."));
}

function countByStep(orders: Array<Record<string, unknown>>, statuses: string[]) {
  return orders.filter((order) => statuses.includes(String(order.fulfillment_status ?? "pending"))).length;
}

function isToday(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return false;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getUTCFullYear() === now.getUTCFullYear()
    && date.getUTCMonth() === now.getUTCMonth()
    && date.getUTCDate() === now.getUTCDate();
}

function buildOrderRows(
  orders: Array<Record<string, unknown>>,
  itemsByOrder: Map<string, number>,
  defaultWarehouseCode: string
): WarehouseOrderRow[] {
  return orders.map((order) => {
    const orderId = String(order.id ?? "");
    return buildWarehouseOrderRow(order, {
      itemCount: itemsByOrder.get(orderId) ?? 0,
      defaultWarehouseCode
    });
  });
}

export default async function WarehouseOrdersPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const fulfillmentFilter = searchValue(params, "fulfillment_status");
  const query = searchValue(params, "q").trim();
  const pageRaw = Number(searchValue(params, "page") || "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSize = 80;
  const offset = (page - 1) * pageSize;
  const operationStatus = searchValue(params, "operation_status");
  const operationMessage = searchValue(params, "operation_message");

  const authPromise = getCurrentAuthContext();
  const [snapshot, policy, scope] = await Promise.all([
    getWarehouseSnapshot({
      scope: "ordersList",
      limit: pageSize,
      offset,
      search: query || undefined
    }),
    getAdminSettingsPolicy(),
    authPromise.then((auth) => resolveWarehouseScope({ userId: auth.userId, role: auth.role }))
  ]);
  const defaultWarehouseCode = policy.defaultWarehouseCode;

  const assignedOrders = filterOrdersForWarehouseScope(snapshot.data.orders, scope, defaultWarehouseCode);

  const itemsByOrder = new Map<string, number>();
  for (const item of snapshot.data.orderItems) {
    const orderId = String(item.order_id ?? "");
    if (!orderId) continue;
    itemsByOrder.set(orderId, (itemsByOrder.get(orderId) ?? 0) + Number(item.quantity ?? 0));
  }

  // Search is server-side; fulfillment status + SKU haystack stay client-side on the page slice.
  const filteredOrders = assignedOrders.filter((order) => {
    const fulfillmentStatus = String(order.fulfillment_status ?? "");
    if (!matchesEmployeeFulfillmentFilter(fulfillmentStatus, fulfillmentFilter)) return false;
    if (!query) return true;
    const orderId = String(order.id ?? "");
    const skuHaystack = snapshot.data.orderItems
      .filter((item) => String(item.order_id ?? "") === orderId)
      .map((item) => String(item.sku ?? ""))
      .join(" ")
      .toLowerCase();
    return skuHaystack.includes(query.toLowerCase());
  });

  const queueRows = buildOrderRows(filteredOrders, itemsByOrder, defaultWarehouseCode);
  const dispatchedToday = assignedOrders.filter((order) =>
    ["shipped", "delivered"].includes(String(order.fulfillment_status ?? "")) && isToday(order.updated_at)
  );

  return (
    <ControlShell
      eyebrow=""
      title="Orders"
      description="Orders received from admin. Open an order to receive or dispatch it."
      actions={[
        { label: "Fulfillment", href: "/warehouse/fulfillment" },
        { label: "History", href: "/warehouse/activity" }
      ]}
    >
      <div data-warehouse-orders-route className="grid gap-6">
        <WarehouseOpsLiveSync enabled={policy.realtimeUpdatesEnabled} />
        <OperationalFeedback
          status={operationStatus}
          message={operationMessage}
          context="Order"
          idle="Order updates and validation messages appear here."
        />

        <WarehouseKpiStrip
          tiles={[
            { label: "Received", value: countByStep(assignedOrders, ["pending"]), href: "/warehouse/orders?fulfillment_status=pending" },
            { label: "Picking", value: countByStep(assignedOrders, [...RECEIVED_FULFILLMENT_STATUSES]), href: "/warehouse/fulfillment" },
            { label: "Dispatched Today", value: dispatchedToday.length, href: "/warehouse/activity" },
            { label: "Cancelled", value: countByStep(assignedOrders, ["cancelled"]) }
          ]}
        />

        <form className="grid gap-3 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-4 md:grid-cols-[1fr_220px_auto] md:items-end">
          <label className="grid gap-2 text-sm">
            <span className="text-[var(--platform-text-secondary)]">Search</span>
            <input
              name="q"
              defaultValue={query}
              placeholder="Order number, customer, or SKU"
              className="rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)]"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-[var(--platform-text-secondary)]">Status</span>
            <select
              name="fulfillment_status"
              defaultValue={fulfillmentFilter}
              className="rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-[var(--platform-text-primary)] outline-none"
            >
              {ORDER_STEP_FILTER_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button className="rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-primary)]">
            Filter
          </button>
        </form>

        <section className="grid gap-3">
          <h2 className="text-sm font-semibold text-[var(--platform-text-primary)]">Order Queue</h2>
          <WarehouseOrderQueueTable
            rows={queueRows}
            cancelAction={cancelOrderWithFeedback}
            dispatchAction={dispatchOrderWithFeedback}
          />
        </section>
      </div>
    </ControlShell>
  );
}
