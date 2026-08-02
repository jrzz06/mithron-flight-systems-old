"use client";

import {
  OperationalDangerAction,
  OperationalMoreActions,
  OperationalSecondaryAction
} from "@/components/admin/operational-action-panel";
import { WarehouseOpenOrderLink } from "@/components/warehouse/warehouse-open-order-link";
import { employeeFulfillmentLabel } from "@/lib/warehouse/operational-labels";
import {
  canCancelOrder,
  canDispatchOrder,
  type WarehouseOrderRow
} from "@/lib/warehouse/order-helpers";
import { useUnreadOrderNotifications } from "@/hooks/use-unread-order-notifications";

const dispatchButtonWrapClass =
  "[&_button]:platform-btn-secondary [&_button]:platform-btn-sm [&_button]:h-8 [&_button]:w-auto [&_button]:min-h-8 [&_button]:rounded-[8px] [&_button]:px-3 [&_button]:text-xs";

type WarehouseOrderQueueTableProps = {
  rows: WarehouseOrderRow[];
  cancelAction: (formData: FormData) => Promise<void>;
  dispatchAction: (formData: FormData) => Promise<void>;
};

function statusBadgeClass(step: string) {
  if (["dispatched", "ready_to_dispatch", "shipped", "in_transit", "delivered"].includes(step)) {
    return "bg-emerald-500/15 text-emerald-300";
  }
  if (["packing", "processing", "picked", "packed"].includes(step)) {
    return "bg-amber-400/15 text-amber-300";
  }
  if (step === "cancelled" || step === "returned") {
    return "bg-rose-500/15 text-rose-300";
  }
  return "bg-[var(--platform-accent-soft)] text-[var(--platform-accent)]";
}

function StatusBadge({ step }: { step: string }) {
  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${statusBadgeClass(step)}`}>
      {employeeFulfillmentLabel(step)}
    </span>
  );
}

function OrderActions({
  order,
  step,
  onView,
  cancelAction,
  dispatchAction
}: {
  order: WarehouseOrderRow;
  step: string;
  onView: (orderId: string) => void;
  cancelAction: (formData: FormData) => Promise<void>;
  dispatchAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="platform-action-group flex min-w-0 flex-wrap items-start gap-2">
      {canDispatchOrder(step) ? (
        <>
          <WarehouseOpenOrderLink orderId={order.orderId} onView={onView} />
          <div className={dispatchButtonWrapClass}>
            <OperationalSecondaryAction
              action={dispatchAction}
              buttonLabel="Dispatch"
              pendingLabel="Dispatching"
              confirmMessage={`Dispatch order ${order.orderNumber}?`}
              confirmDescription="This moves the order to Dispatch History."
              confirmLabel="Dispatch"
            >
              <input name="order_id" type="hidden" value={order.orderId} />
              <input name="warehouse_code" type="hidden" value={order.warehouseCode} />
            </OperationalSecondaryAction>
          </div>
        </>
      ) : null}
      {canCancelOrder(step) ? (
        <OperationalMoreActions summaryLabel="More actions">
          <OperationalDangerAction
            action={cancelAction}
            buttonLabel="Delete order"
            pendingLabel="Deleting"
            confirmMessage={`Delete order ${order.orderNumber}?`}
            confirmDescription="This permanently deletes the order from the warehouse queue. Type the order number to confirm."
            requireTypedText={order.orderNumber}
            typedTextLabel={`Type ${order.orderNumber} to confirm`}
            confirmLabel="Delete"
          >
            <input name="order_id" type="hidden" value={order.orderId} />
            <input name="expected_updated_at" type="hidden" value={order.updatedAt} />
            <textarea
              name="cancel_reason"
              required
              rows={2}
              placeholder="Deletion reason"
              className="w-full min-w-0 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 text-sm"
            />
          </OperationalDangerAction>
        </OperationalMoreActions>
      ) : null}
    </div>
  );
}

function OrderRowCard({
  order,
  step,
  unread,
  onView,
  cancelAction,
  dispatchAction
}: {
  order: WarehouseOrderRow;
  step: string;
  unread: boolean;
  onView: (orderId: string) => void;
  cancelAction: (formData: FormData) => Promise<void>;
  dispatchAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <article
      className={`min-w-0 rounded-[var(--platform-radius)] border p-4 ${
        unread
          ? "border-amber-400/40 bg-amber-400/[0.06]"
          : "border-[var(--platform-border)] bg-[var(--platform-surface)]"
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-[-0.01em] text-[var(--platform-text-primary)]">
            {unread ? (
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" role="img" aria-label="New order" />
            ) : null}
            <span className="min-w-0 break-words">{order.orderNumber}</span>
          </p>
          <p className="mt-1.5 min-w-0 truncate text-sm font-medium text-[var(--platform-text-primary)]" title={order.customerName}>
            {order.customerName}
          </p>
          <p className="mt-1 min-w-0 truncate text-xs leading-4 text-[var(--platform-text-muted)]" title={order.customerPhone}>
            {order.customerPhone}
          </p>
          <p className="mt-0.5 min-w-0 truncate text-xs leading-4 text-[var(--platform-text-muted)]" title={order.customerEmail}>
            {order.customerEmail}
          </p>
        </div>
        <StatusBadge step={step} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--platform-text-secondary)]">
        <div className="min-w-0">
          <dt className="text-[var(--platform-text-muted)]">Ship to</dt>
          <dd className="min-w-0 break-words" title={order.shippingAddress}>{order.shippingAddress}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[var(--platform-text-muted)]">Items</dt>
          <dd className="min-w-0 break-words">{String(order.itemCount)}</dd>
        </div>
      </dl>
      <div className="mt-4">
        <OrderActions
          order={order}
          step={step}
          onView={onView}
          cancelAction={cancelAction}
          dispatchAction={dispatchAction}
        />
      </div>
    </article>
  );
}

export function WarehouseOrderQueueTable({ rows, cancelAction, dispatchAction }: WarehouseOrderQueueTableProps) {
  const { unreadOrderIds, markOrderViewed } = useUnreadOrderNotifications("warehouse");

  return (
    <div className="min-w-0 overflow-x-auto rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
      <div className="grid gap-3 p-3 md:hidden">
        {rows.length ? rows.map((order) => (
          <OrderRowCard
            key={order.orderId}
            order={order}
            step={order.fulfillmentStatus}
            unread={unreadOrderIds.has(order.orderId)}
            onView={markOrderViewed}
            cancelAction={cancelAction}
            dispatchAction={dispatchAction}
          />
        )) : (
          <p className="px-2 py-8 text-center text-sm text-[var(--platform-text-muted)]">
            No open orders waiting.
          </p>
        )}
      </div>

      <table data-order-management-table="orders" className="platform-table hidden w-full min-w-[720px] border-collapse text-left text-sm md:table">
        <thead className="border-b border-[var(--platform-border)] type-meta uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
          <tr>
            <th className="px-3 py-3 font-semibold">Order ID</th>
            <th className="px-3 py-3 font-semibold">Customer</th>
            <th className="px-3 py-3 font-semibold">Phone</th>
            <th className="px-3 py-3 font-semibold">Status</th>
            <th className="px-3 py-3 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--platform-border)] text-[var(--platform-text-secondary)]">
          {rows.length ? rows.map((order) => {
            const step = order.fulfillmentStatus;
            const unread = unreadOrderIds.has(order.orderId);
            return (
              <tr key={order.orderId} className={`transition-colors ${unread ? "bg-amber-400/[0.06]" : ""}`}>
                <td className="px-3 py-3 font-medium text-[var(--platform-text-primary)]">
                  <span className="flex min-w-0 items-center gap-2">
                    {unread ? (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" role="img" aria-label="New order" />
                    ) : null}
                    <span className="min-w-0 break-words">{order.orderNumber}</span>
                  </span>
                </td>
                <td className="max-w-[14rem] px-3 py-3">
                  <span className="block min-w-0 truncate font-medium text-[var(--platform-text-primary)]" title={order.customerName}>
                    {order.customerName}
                  </span>
                  <span className="mt-1 block min-w-0 truncate text-xs text-[var(--platform-text-muted)]" title={order.shippingAddress}>
                    {order.shippingAddress}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="block min-w-0 break-words">{order.customerPhone}</span>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge step={step} />
                </td>
                <td className="px-3 py-3">
                  <OrderActions
                    order={order}
                    step={step}
                    onView={markOrderViewed}
                    cancelAction={cancelAction}
                    dispatchAction={dispatchAction}
                  />
                </td>
              </tr>
            );
          }) : (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-[var(--platform-text-muted)]">
                No open orders waiting.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
