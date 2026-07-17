"use client";

import { useMemo, useState } from "react";
import { AdminOrderActionForm, type AdminOrderFormAction } from "@/components/admin/admin-orders-optimistic";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { wrapServerAction } from "@/hooks/use-async-action";
import {
  canCancelOrder,
  canPermanentlyDeleteOrder,
  publicOrderLabel,
  text,
  type AdminRow
} from "@/components/admin/orders/order-view-helpers";
import { orderRadiusControl } from "@/components/admin/orders/order-layout-utils";

type AdminOrderRowQuickActionsProps = {
  order: AdminRow;
  queue: string;
  query: string;
  cancelAdminOrderAction: AdminOrderFormAction;
  permanentDeleteAdminOrderAction: (formData: FormData) => Promise<void>;
};

const inputClass =
  `h-8 min-w-0 flex-1 border border-[var(--platform-border-strong)] bg-[var(--platform-surface-muted)] px-2 text-xs ${orderRadiusControl}`;

export function AdminOrderRowQuickActions({
  order,
  queue,
  query,
  cancelAdminOrderAction,
  permanentDeleteAdminOrderAction
}: AdminOrderRowQuickActionsProps) {
  const [mode, setMode] = useState<"none" | "cancel" | "delete">("none");
  const orderId = text(order.id);
  const orderLabel = publicOrderLabel(order);
  const status = text(order.status);
  const canCancel = canCancelOrder(order) && !["admin_review", "pending_payment"].includes(status);
  const canDelete = canPermanentlyDeleteOrder(order);

  const timedPermanentDelete = useMemo(
    () => wrapServerAction(permanentDeleteAdminOrderAction, { label: "Permanently delete order" }),
    [permanentDeleteAdminOrderAction]
  );

  if (!canCancel && !canDelete) return null;

  return (
    <div
      className="mt-2 border-t border-[var(--platform-border)]/60 pt-2"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {mode === "none" ? (
        <div className="flex flex-wrap gap-2">
          {canCancel ? (
            <button
              type="button"
              onClick={() => setMode("cancel")}
              className={`border border-rose-700/50 px-2 py-1 text-[11px] font-medium text-rose-200 hover:bg-rose-950/30 ${orderRadiusControl}`}
            >
              Cancel
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              onClick={() => setMode("delete")}
              className={`border border-rose-800/50 px-2 py-1 text-[11px] font-medium text-rose-100 hover:bg-rose-950/40 ${orderRadiusControl}`}
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === "cancel" ? (
        <AdminOrderActionForm
          orderId={orderId}
          action={cancelAdminOrderAction}
          nextStatus="cancelled"
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
          <input type="hidden" name="queue" value={queue} />
          {query ? <input type="hidden" name="q" value={query} /> : null}
          <input name="cancel_reason" required placeholder="Cancellation reason" className={inputClass} />
          <OperationalSubmitButton
            pendingLabel="Cancelling..."
            confirmMessage={`Cancel order ${orderLabel}?`}
            className={`border border-rose-700 bg-rose-900/40 px-2 py-1 text-[11px] font-semibold text-rose-100 ${orderRadiusControl}`}
          >
            Confirm cancel
          </OperationalSubmitButton>
          <button
            type="button"
            onClick={() => setMode("none")}
            className={`px-2 py-1 text-[11px] text-[var(--platform-text-muted)] hover:underline ${orderRadiusControl}`}
          >
            Close
          </button>
        </AdminOrderActionForm>
      ) : null}

      {mode === "delete" ? (
        <form action={timedPermanentDelete} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
          <input type="hidden" name="queue" value={queue} />
          {query ? <input type="hidden" name="q" value={query} /> : null}
          <input name="delete_reason" required placeholder="Delete reason" className={inputClass} />
          <OperationalSubmitButton
            pendingLabel="Deleting..."
            confirmMessage={`Permanently delete order ${orderLabel}?`}
            className={`border border-rose-800 bg-rose-950/40 px-2 py-1 text-[11px] font-semibold text-rose-100 ${orderRadiusControl}`}
          >
            Confirm delete
          </OperationalSubmitButton>
          <button
            type="button"
            onClick={() => setMode("none")}
            className={`px-2 py-1 text-[11px] text-[var(--platform-text-muted)] hover:underline ${orderRadiusControl}`}
          >
            Close
          </button>
        </form>
      ) : null}
    </div>
  );
}
