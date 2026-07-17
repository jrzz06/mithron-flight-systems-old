"use client";

import Link from "next/link";
import {
  OperationalDangerAction,
  OperationalMoreActions
} from "@/components/admin/operational-action-panel";
import { employeeFulfillmentLabel } from "@/lib/warehouse/operational-labels";
import type { WarehouseOrderRow } from "@/lib/warehouse/order-helpers";
import { useUnreadOrderNotifications } from "@/hooks/use-unread-order-notifications";

const actionButtonClass = "platform-btn-secondary platform-btn-sm";

type WarehouseOrderQueueTableProps = {
  rows: WarehouseOrderRow[];
  cancelAction: (formData: FormData) => Promise<void>;
};

function canCancel(step: string) {
  return !["shipped", "delivered", "cancelled", "returned"].includes(step);
}

function canOpenFulfillment(step: string) {
  return !["shipped", "delivered", "cancelled", "returned"].includes(step);
}

function OrderRowCard({
  order,
  step,
  unread,
  onView,
  cancelAction
}: {
  order: WarehouseOrderRow;
  step: string;
  unread: boolean;
  onView: (orderId: string) => void;
  cancelAction: (formData: FormData) => Promise<void>;
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
          <p className="flex min-w-0 items-center gap-2 font-medium text-[var(--platform-text-primary)]">
            {unread ? (
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" role="img" aria-label="New order" />
            ) : null}
            <span className="min-w-0 break-words">{order.orderNumber}</span>
          </p>
          <p className="mt-1 min-w-0 truncate text-sm font-medium text-[var(--platform-text-secondary)]" title={order.customerName}>
            {order.customerName}
          </p>
          <p className="mt-0.5 min-w-0 truncate text-xs text-[var(--platform-text-muted)]" title={order.customerPhone}>
            {order.customerPhone}
          </p>
          <p className="mt-0.5 min-w-0 truncate text-xs text-[var(--platform-text-muted)]" title={order.customerEmail}>
            {order.customerEmail}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-[var(--platform-accent-soft)] px-2 py-1 text-xs font-medium text-[var(--platform-accent)]">
          {employeeFulfillmentLabel(step)}
        </span>
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
        <div className="min-w-0">
          <dt className="text-[var(--platform-text-muted)]">Payment</dt>
          <dd className="min-w-0 break-words">{order.paymentStatus}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[var(--platform-text-muted)]">Priority</dt>
          <dd className="min-w-0 break-words">{order.priority}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[var(--platform-text-muted)]">Est. dispatch</dt>
          <dd className="min-w-0 break-words">{order.estimatedDispatch}</dd>
        </div>
      </dl>
      <div className="platform-action-group mt-4 flex flex-wrap gap-2">
        {canOpenFulfillment(step) ? (
          <Link
            href={`/warehouse/fulfillment/${order.orderId}`}
            className={actionButtonClass}
            onClick={() => onView(order.orderId)}
          >
            Open
          </Link>
        ) : null}
        {canCancel(step) ? (
          <OperationalMoreActions>
            <OperationalDangerAction
              action={cancelAction}
              buttonLabel="Cancel order"
              pendingLabel="Cancelling"
            >
              <input name="order_id" type="hidden" value={order.orderId} />
              <input name="expected_updated_at" type="hidden" value={order.updatedAt} />
              <textarea
                name="cancel_reason"
                required
                rows={2}
                placeholder="Cancellation reason"
                className="w-full min-w-0 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 text-sm"
              />
            </OperationalDangerAction>
          </OperationalMoreActions>
        ) : null}
      </div>
    </article>
  );
}

export function WarehouseOrderQueueTable({ rows, cancelAction }: WarehouseOrderQueueTableProps) {
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
          />
        )) : (
          <p className="px-2 py-8 text-center text-sm text-[var(--platform-text-muted)]">
            No orders are waiting for processing.
          </p>
        )}
      </div>

      <table data-order-management-table="orders" className="platform-table hidden w-full min-w-[960px] border-collapse text-left text-sm md:table">
        <thead className="border-b border-[var(--platform-border)] text-[11px] uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
          <tr>
            <th className="px-3 py-3 font-semibold">Order</th>
            <th className="px-3 py-3 font-semibold">Customer</th>
            <th className="px-3 py-3 font-semibold">Order Date</th>
            <th className="px-3 py-3 font-semibold">Items</th>
            <th className="px-3 py-3 font-semibold">Priority</th>
            <th className="px-3 py-3 font-semibold">Shipping</th>
            <th className="px-3 py-3 font-semibold">Payment</th>
            <th className="px-3 py-3 font-semibold">Status</th>
            <th className="px-3 py-3 font-semibold">Est. Dispatch</th>
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
                <td className="max-w-[16rem] px-3 py-3">
                  <span className="block min-w-0 truncate font-medium text-[var(--platform-text-primary)]" title={order.customerName}>
                    {order.customerName}
                  </span>
                  <span className="mt-0.5 block min-w-0 truncate text-xs text-[var(--platform-text-muted)]" title={order.customerPhone}>
                    {order.customerPhone}
                  </span>
                  <span className="mt-0.5 block min-w-0 truncate text-xs text-[var(--platform-text-muted)]" title={order.customerEmail}>
                    {order.customerEmail}
                  </span>
                  <span className="mt-1 block min-w-0 truncate text-xs text-[var(--platform-text-muted)]" title={order.shippingAddress}>
                    {order.shippingAddress}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3">{order.orderDate}</td>
                <td className="px-3 py-3">{String(order.itemCount)}</td>
                <td className="px-3 py-3">
                  <span className="block min-w-0 break-words">{order.priority}</span>
                </td>
                <td className="px-3 py-3">
                  <span className="block min-w-0 break-words">{order.shippingMethod}</span>
                </td>
                <td className="px-3 py-3">
                  <span className="block min-w-0 break-words">{order.paymentStatus}</span>
                </td>
                <td className="px-3 py-3">
                  <span className="block min-w-0 break-words">{employeeFulfillmentLabel(step)}</span>
                </td>
                <td className="px-3 py-3">
                  <span className="block min-w-0 break-words">{order.estimatedDispatch}</span>
                </td>
                <td className="px-3 py-3">
                  <div className="platform-action-group flex min-w-0 flex-wrap gap-2">
                    {canOpenFulfillment(step) ? (
                      <Link
                        href={`/warehouse/fulfillment/${order.orderId}`}
                        className={actionButtonClass}
                        onClick={() => markOrderViewed(order.orderId)}
                      >
                        Open
                      </Link>
                    ) : null}
                    {canCancel(step) ? (
                      <OperationalMoreActions>
                        <OperationalDangerAction
                          action={cancelAction}
                          buttonLabel="Cancel order"
                          pendingLabel="Cancelling"
                        >
                          <input name="order_id" type="hidden" value={order.orderId} />
                          <input name="expected_updated_at" type="hidden" value={order.updatedAt} />
                          <textarea
                            name="cancel_reason"
                            required
                            rows={2}
                            placeholder="Cancellation reason"
                            className="w-full min-w-0 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 text-sm"
                          />
                        </OperationalDangerAction>
                      </OperationalMoreActions>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          }) : (
            <tr>
              <td colSpan={10} className="px-4 py-10 text-center text-[var(--platform-text-muted)]">
                No orders are waiting for processing.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
