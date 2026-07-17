import { redirect } from "next/navigation";
import { isNextRedirect } from "@/lib/server-action-feedback";
import { adminOrderActionSuccess, type AdminOrderActionResult } from "@/lib/admin/order-action-result";
import { AdminOrdersWorkspace } from "@/components/admin/admin-orders-workspace-loader";
import { OrdersLiveSync } from "@/components/admin/orders-live-sync";
import {
  orderMatchesViewQueue,
  orderSelectionKey,
  resolveOrderBySelectionKey,
  resolveOrdersViewQueue
} from "@/components/admin/orders/order-view-helpers";
import {
  addOrderItemsFormAction,
  removeOrderItemFormAction,
  assignOrderToWarehouseFormAction,
  cancelAdminOrderFormAction,
  confirmPaidOrderFormAction,
  createAdminManualOrderFormAction,
  markOrderPaidFormAction,
  markOrderRefundedFormAction,
  permanentDeleteAdminOrderFormAction,
  rejectAdminOrderFormAction,
  updateOrderShippingAddressFormAction
} from "@/app/admin/orders/actions";
import { createShipmentFormAction, updateWarehouseOrderLifecycleFormAction } from "@/app/warehouse/actions";
import { getWarehouseSnapshot } from "@/services/admin";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { listActiveWarehouses } from "@/services/warehouses";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function orderActionMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function rethrowIfNextRedirect(error: unknown) {
  if (isNextRedirect(error)) throw error;
}

function redirectWithOrderFeedback(
  orderKey: string,
  status: "success" | "error",
  message: string,
  queue: string,
  query: string
) {
  const params = new URLSearchParams();
  if (orderKey) params.set("order", orderKey);
  if (queue) params.set("queue", queue);
  if (query) params.set("q", query);
  params.set("order_status", status);
  params.set("order_message", message);
  redirect(`/admin/orders?${params.toString()}`);
}

/** Thin adapters for warehouse actions that may throw/redirect instead of returning results. */
async function updateAdminOrderLifecycleAction(formData: FormData): Promise<AdminOrderActionResult> {
  "use server";
  try {
    await updateWarehouseOrderLifecycleFormAction(formData);
    return adminOrderActionSuccess();
  } catch (error) {
    rethrowIfNextRedirect(error);
    return {
      ok: false,
      code: "error",
      message: orderActionMessage(error).slice(0, 240)
    };
  }
}

async function confirmAdminWarehouseHandoffAction(formData: FormData): Promise<AdminOrderActionResult> {
  "use server";
  try {
    await createShipmentFormAction(formData);
    return adminOrderActionSuccess();
  } catch (error) {
    rethrowIfNextRedirect(error);
    return {
      ok: false,
      code: "error",
      message: orderActionMessage(error).slice(0, 240)
    };
  }
}

async function permanentDeleteAdminOrderAction(formData: FormData) {
  "use server";
  const queue = String(formData.get("queue") ?? "trash");
  const query = String(formData.get("q") ?? "");
  try {
    await permanentDeleteAdminOrderFormAction(formData);
  } catch (error) {
    rethrowIfNextRedirect(error);
    redirectWithOrderFeedback("", "error", orderActionMessage(error).slice(0, 240), queue, query);
  }
  const params = new URLSearchParams();
  if (queue) params.set("queue", queue);
  if (query) params.set("q", query);
  params.set("order_status", "success");
  params.set("order_message", "Order permanently deleted.");
  redirect(`/admin/orders?${params.toString()}`);
}

async function createAdminManualOrderAction(formData: FormData) {
  "use server";
  try {
    await createAdminManualOrderFormAction(formData);
  } catch (error) {
    rethrowIfNextRedirect(error);
    const message = orderActionMessage(error).slice(0, 240);
    const params = new URLSearchParams({
      queue: "confirmed",
      order_status: "error",
      order_message: message
    });
    redirect(`/admin/orders?${params.toString()}`);
  }
}

export default async function AdminOrdersPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const [snapshot, warehouses, policy] = await Promise.all([
    getWarehouseSnapshot({ scope: "orders", ordersFilter: "all" }),
    listActiveWarehouses(process.env, { includeOperatorCounts: false }),
    getAdminSettingsPolicy()
  ]);
  const params = searchParams ? await searchParams : {};
  const queue = resolveOrdersViewQueue(searchValue(params, "queue") || "all");
  const selectedKey = searchValue(params, "order");
  const orderStatus = searchValue(params, "order_status");
  const orderMessage = searchValue(params, "order_message");
  const query = searchValue(params, "q").toLowerCase();

  const queueOrders = snapshot.data.orders.filter((order) => orderMatchesViewQueue(order, queue));
  const selectedOrder =
    resolveOrderBySelectionKey(queueOrders, selectedKey)
    ?? resolveOrderBySelectionKey(snapshot.data.orders, selectedKey);
  const selectedOrderId = selectedOrder ? text(selectedOrder.id) : "";
  const selectedOrderKey = selectedOrder ? orderSelectionKey(selectedOrder) : selectedKey;

  return (
    <>
      <OrdersLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <AdminOrdersWorkspace
        orders={snapshot.data.orders}
        realtimeUpdatesEnabled={policy.realtimeUpdatesEnabled}
        orderItems={snapshot.data.orderItems}
        inventory={snapshot.data.inventory}
        shipments={snapshot.data.shipments}
        products={snapshot.data.products}
        warehouses={warehouses}
        defaultWarehouseCode={policy.defaultWarehouseCode}
        selectedOrder={selectedOrder}
        selectedOrderId={selectedOrderId}
        selectedOrderKey={selectedOrderKey}
        queue={queue}
        query={query}
        orderStatus={orderStatus}
        orderMessage={orderMessage}
        snapshotStatus={snapshot.status}
        blockedReason={snapshot.blockedReason}
        snapshotLimitWarning={snapshot.snapshotLimitWarning}
        createAdminManualOrderAction={createAdminManualOrderAction}
        confirmAdminOrderAction={confirmPaidOrderFormAction}
        rejectAdminOrderAction={rejectAdminOrderFormAction}
        cancelAdminOrderAction={cancelAdminOrderFormAction}
        permanentDeleteAdminOrderAction={permanentDeleteAdminOrderAction}
        assignAdminWarehouseAction={assignOrderToWarehouseFormAction}
        markOrderPaidAdminOrderAction={markOrderPaidFormAction}
        markOrderRefundedAdminOrderAction={markOrderRefundedFormAction}
        updateAdminOrderLifecycleAction={updateAdminOrderLifecycleAction}
        confirmAdminWarehouseHandoffAction={confirmAdminWarehouseHandoffAction}
        updateOrderShippingAddressAction={updateOrderShippingAddressFormAction}
        addOrderItemsAction={addOrderItemsFormAction}
        removeOrderItemAction={removeOrderItemFormAction}
      />
    </>
  );
}
