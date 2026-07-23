"use client";

import Link from "next/link";
import { createContext, useContext, useMemo, useOptimistic, type ReactNode } from "react";
import { useOptionalAdminRealtime } from "@/components/admin/realtime/admin-realtime-provider";
import {
  type AdminOrderFormAction
} from "@/lib/admin/order-action-result";
import { runOrderFormActionWithConflictRetry } from "@/lib/admin/order-action-client";
import { isActionNavigationError } from "@/lib/server-action-errors";
import { markControlPlaneLiveSyncFlush } from "@/lib/control-plane/shared-live-sync-coordinator";
import { wrapServerAction } from "@/hooks/use-async-action";
import { useAdminOrdersLiveState } from "@/components/admin/orders/admin-orders-live-state";
import { StatusBadge } from "@/components/admin/module-panel";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";

type AdminRow = Record<string, unknown>;

type OptimisticOrderUpdate = {
  orderId: string;
  status?: string;
  fulfillmentStatus?: string;
  assignedWarehouseCode?: string;
  pending?: boolean;
};

type ActionFeedback = {
  status: "warning" | "error" | "success";
  message: string;
};

type AdminOrdersOptimisticContextValue = {
  markOrderUpdate: (update: OptimisticOrderUpdate) => void;
  onActionFeedback?: (feedback: ActionFeedback) => void;
};

const AdminOrdersOptimisticContext = createContext<AdminOrdersOptimisticContextValue | null>(null);

export function useAdminOrdersOptimistic() {
  const context = useContext(AdminOrdersOptimisticContext);
  if (!context) {
    throw new Error("useAdminOrdersOptimistic must be used within AdminOrdersOptimisticProvider");
  }
  return context;
}

export type { AdminOrderFormAction } from "@/lib/admin/order-action-result";

export function AdminOrderActionForm({
  orderId,
  action,
  children,
  nextStatus,
  className
}: {
  orderId: string;
  action: AdminOrderFormAction;
  children: ReactNode;
  nextStatus?: string;
  className?: string;
}) {
  const { markOrderUpdate, onActionFeedback } = useAdminOrdersOptimistic();
  const { patchOrder } = useAdminOrdersLiveState();
  const realtime = useOptionalAdminRealtime();

  return (
    <form
      className={className}
      action={wrapServerAction(async (formData) => {
        const warehouseCode = String(formData.get("warehouse_code") ?? "").trim();
        markOrderUpdate({
          orderId,
          status: nextStatus,
          fulfillmentStatus: nextStatus === "assigned" ? "processing" : undefined,
          assignedWarehouseCode: warehouseCode || undefined,
          pending: true
        });

        let navigated = false;
        try {
          const outcome = await raceWithTimeout(
            runOrderFormActionWithConflictRetry(action, formData, {
              orderId,
              patchOrder,
              onActionFeedback
            }),
            undefined,
            "Update order"
          );
          if (outcome.kind === "failed") {
            markOrderUpdate({ orderId, pending: false });
            return;
          }
          // Clear pending as soon as the server action returns so the button
          // never stays stuck waiting on a full RSC re-render.
          markOrderUpdate({ orderId, pending: false });
          onActionFeedback?.({ status: "success", message: "Order updated." });
        } catch (error) {
          if (isActionNavigationError(error)) {
            navigated = true;
            throw error;
          }
          markOrderUpdate({ orderId, pending: false });
          throw error;
        } finally {
          if (!navigated) {
            markControlPlaneLiveSyncFlush();
            void realtime?.reconcileResources(["orders"]);
          }
        }
      }, { label: "Update order" })}
    >
      {children}
    </form>
  );
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function moneyText(value: unknown) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    Number.isFinite(parsed) ? parsed : 0
  );
}

export function AdminOrdersOptimisticProvider({
  orders,
  onActionFeedback,
  children
}: {
  orders: AdminRow[];
  onActionFeedback?: (feedback: ActionFeedback) => void;
  children: (orders: AdminRow[]) => ReactNode;
}) {
  const [optimisticOrders, markOrderUpdate] = useOptimistic(orders, (state, update: OptimisticOrderUpdate) =>
    state.map((order) => {
      if (text(order.id) !== update.orderId) return order;
      const existingMetadata =
        order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
          ? (order.metadata as Record<string, unknown>)
          : {};
      return {
        ...order,
        ...(update.status ? { status: update.status } : {}),
        ...(update.fulfillmentStatus ? { fulfillment_status: update.fulfillmentStatus } : {}),
        ...(update.assignedWarehouseCode
          ? {
              metadata: {
                ...existingMetadata,
                assigned_warehouse_code: update.assignedWarehouseCode
              }
            }
          : {}),
        ...(update.pending ? { _optimistic_pending: true } : {}),
        ...(update.pending === false ? { _optimistic_pending: false } : {})
      };
    })
  );

  const contextValue = useMemo<AdminOrdersOptimisticContextValue>(
    () => ({ markOrderUpdate, onActionFeedback }),
    [markOrderUpdate, onActionFeedback]
  );

  return (
    <AdminOrdersOptimisticContext.Provider value={contextValue}>
      {children(optimisticOrders)}
    </AdminOrdersOptimisticContext.Provider>
  );
}

function AdminOrdersQueueList({
  orders,
  orderItems,
  selectedKey,
  selectedOrderId,
  queue,
  query,
  publicOrderLabel,
  productSummary,
  orderDate,
  paymentLabel,
  assignedWarehouseCode,
  defaultWarehouseCode,
  buildOrdersUrl
}: {
  orders: AdminRow[];
  orderItems: AdminRow[];
  selectedKey: string;
  selectedOrderId: string;
  queue: string;
  query: string;
  publicOrderLabel: (order: AdminRow) => string;
  productSummary: (orderId: string, orderItems: AdminRow[]) => string;
  orderDate: (order: AdminRow) => string;
  paymentLabel: (order: AdminRow) => string;
  assignedWarehouseCode: (order: AdminRow, fallback: string) => string;
  defaultWarehouseCode: string;
  buildOrdersUrl: (params: Record<string, string | undefined>) => string;
}) {
  if (!orders.length) {
    return <p className="px-4 py-6 text-sm text-[var(--platform-text-muted)]">No orders match this queue.</p>;
  }

  return (
    <div className="divide-y divide-[var(--platform-border)]">
      {orders.slice(0, 40).map((order) => {
        const orderId = text(order.id);
        const orderNumber = publicOrderLabel(order);
        const isSelected = selectedKey === orderNumber || selectedOrderId === orderId;
        const warehouse = assignedWarehouseCode(order, defaultWarehouseCode);
        const isPending = Boolean(order._optimistic_pending);

        return (
          <Link
            key={orderId || orderNumber}
            href={buildOrdersUrl({ queue, order: orderNumber, q: query || undefined })}
            className={`block px-4 py-3 transition hover:bg-[var(--platform-surface-muted)] ${
              isSelected ? "bg-[var(--platform-accent-soft)]" : ""
            } ${isPending ? "opacity-60" : ""}`}
            aria-current={isSelected ? "true" : undefined}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--platform-text-primary)]">{orderNumber}</p>
                <p className="mt-1 truncate text-xs text-[var(--platform-text-muted)]">{text(order.customer_email, "No email")}</p>
                <p className="mt-1 text-xs text-[var(--platform-text-muted)]">{productSummary(orderId, orderItems)}</p>
                <p className="mt-1 text-xs text-[var(--platform-text-muted)]">{orderDate(order)} · {warehouse} · {paymentLabel(order)}</p>
              </div>
              <div className="grid shrink-0 justify-items-end gap-1.5">
                <StatusBadge status={text(order.status, "pending")} />
                {isPending ? (
                  <span className="type-badge font-medium uppercase tracking-wide text-[var(--platform-accent)]">Updating…</span>
                ) : null}
                <span className="text-xs font-medium text-[var(--platform-text-secondary)]">{moneyText(order.total)}</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
