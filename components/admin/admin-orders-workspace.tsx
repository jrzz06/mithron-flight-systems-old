"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OperationalFeedback } from "@/components/admin/module-panel";
import { AdminOrdersOptimisticProvider, type AdminOrderFormAction } from "@/components/admin/admin-orders-optimistic";
import { AdminOrdersLiveStateProvider, useAdminOrdersLiveState } from "@/components/admin/orders/admin-orders-live-state";
import { AdminOrderActionsRail } from "@/components/admin/orders/admin-order-actions-rail";
import { AdminOrderCreateDrawer } from "@/components/admin/orders/admin-order-create-drawer";
import { AdminOrderDetail } from "@/components/admin/orders/admin-order-detail";
import { AdminOrderDetailEmpty, AdminOrderDetailPanel } from "@/components/admin/orders/admin-order-detail-panel";
import { AdminOrderList } from "@/components/admin/orders/admin-order-list";
import { AdminOrdersFilterBar } from "@/components/admin/orders/admin-orders-filter-bar";
import { AdminOrdersShell } from "@/components/admin/orders/admin-orders-shell";
import { AdminOrdersToolbar } from "@/components/admin/orders/admin-orders-toolbar";
import { useAdminOrdersKeyboard } from "@/components/admin/orders/use-admin-orders-keyboard";
import { useAdminLiveCollectionRows } from "@/components/admin/realtime/use-admin-live-collection-rows";
import { useUnreadOrderNotifications } from "@/hooks/use-unread-order-notifications";
import {
  buildOrdersUrl,
  filterOrders,
  filtersToSearchParams,
  orderItemsForOrder,
  orderSelectionKey,
  parseOrderFiltersFromSearchParams,
  text,
  sortOrders,
  type AdminRow,
  type OrderFilterState
} from "@/components/admin/orders/order-view-helpers";
import { isLegacyOrderConflictFeedback, ORDER_CONFLICT_FEEDBACK_HINT } from "@/lib/admin/order-conflict-feedback";

type AdminOrdersWorkspaceProps = {
  orders: AdminRow[];
  orderItems: AdminRow[];
  inventory: AdminRow[];
  shipments: AdminRow[];
  products: AdminRow[];
  warehouses: Array<{ code: string; name: string }>;
  defaultWarehouseCode: string;
  selectedOrder: AdminRow | null;
  selectedOrderId: string;
  selectedOrderKey: string;
  queue: string;
  query: string;
  orderStatus: string;
  orderMessage: string;
  snapshotStatus: string;
  realtimeUpdatesEnabled?: boolean;
  blockedReason?: string | null;
  snapshotLimitWarning?: string | null;
  createAdminManualOrderAction: (formData: FormData) => Promise<void>;
  confirmAdminOrderAction: AdminOrderFormAction;
  rejectAdminOrderAction: AdminOrderFormAction;
  cancelAdminOrderAction: AdminOrderFormAction;
  permanentDeleteAdminOrderAction: (formData: FormData) => Promise<void>;
  assignAdminWarehouseAction: AdminOrderFormAction;
  markOrderPaidAdminOrderAction: AdminOrderFormAction;
  markOrderRefundedAdminOrderAction: AdminOrderFormAction;
  setOrderPaymentRequirementAdminOrderAction: AdminOrderFormAction;
  updateAdminOrderLifecycleAction: AdminOrderFormAction;
  confirmAdminWarehouseHandoffAction: AdminOrderFormAction;
  updateOrderShippingAddressAction: AdminOrderFormAction;
  addOrderItemsAction: AdminOrderFormAction;
  removeOrderItemAction: AdminOrderFormAction;
};

function ShortcutsLegend({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-sm border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4 text-sm rounded-[var(--platform-radius)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 className="font-semibold text-[var(--platform-text-primary)]">Keyboard shortcuts</h3>
        <ul className="mt-3 space-y-1.5 text-xs text-[var(--platform-text-secondary)]">
          <li><kbd className="rounded border px-1">↑</kbd> / <kbd className="rounded border px-1">↓</kbd> Navigate orders</li>
          <li><kbd className="rounded border px-1">Esc</kbd> Close drawer or clear selection</li>
          <li><kbd className="rounded border px-1">c</kbd> Create order</li>
          <li><kbd className="rounded border px-1">?</kbd> Show shortcuts</li>
        </ul>
        <button type="button" onClick={onClose} className="mt-4 text-xs text-violet-300 hover:underline">
          Close
        </button>
      </div>
    </div>
  );
}

export function AdminOrdersWorkspace(props: AdminOrdersWorkspaceProps) {
  return (
    <AdminOrdersLiveStateProvider
      orders={props.orders}
      orderItems={props.orderItems}
      enabled={props.realtimeUpdatesEnabled !== false}
    >
      <AdminOrdersWorkspaceInner {...props} />
    </AdminOrdersLiveStateProvider>
  );
}

function AdminOrdersWorkspaceInner(props: AdminOrdersWorkspaceProps) {
  const {
    inventory,
    shipments,
    products,
    warehouses,
    defaultWarehouseCode,
    selectedOrder,
    selectedOrderId,
    selectedOrderKey,
    queue,
    orderStatus,
    orderMessage,
    blockedReason,
    snapshotLimitWarning,
    createAdminManualOrderAction,
    confirmAdminOrderAction,
    rejectAdminOrderAction,
    cancelAdminOrderAction,
    permanentDeleteAdminOrderAction,
    assignAdminWarehouseAction,
    markOrderPaidAdminOrderAction,
    markOrderRefundedAdminOrderAction,
    setOrderPaymentRequirementAdminOrderAction,
    updateAdminOrderLifecycleAction,
    confirmAdminWarehouseHandoffAction,
    updateOrderShippingAddressAction,
    addOrderItemsAction,
    removeOrderItemAction
  } = props;

  const router = useRouter();
  const searchParams = useSearchParams();
  const { liveOrders, liveOrderItems } = useAdminOrdersLiveState();
  const liveEnabled = props.realtimeUpdatesEnabled !== false;
  const liveShipments = useAdminLiveCollectionRows(
    "orders",
    "shipments",
    shipments,
    ["id"],
    liveEnabled
  );
  const liveInventory = useAdminLiveCollectionRows(
    "orders",
    "inventory",
    inventory,
    ["id", "product_slug"],
    liveEnabled
  );
  const createOpen = searchParams.get("tool") === "create";
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [clientFeedback, setClientFeedback] = useState<{ status: string; message: string } | null>(null);

  const filters = useMemo(
    () => parseOrderFiltersFromSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  const selectedKey = selectedOrderKey || (selectedOrder ? orderSelectionKey(selectedOrder) : "");

  const { unreadOrderIds, markOrderViewed } = useUnreadOrderNotifications(
    liveEnabled ? "admin" : undefined
  );

  // Viewing an order clears its unread notifications (and the row highlight).
  useEffect(() => {
    if (selectedOrderId && unreadOrderIds.has(selectedOrderId)) {
      markOrderViewed(selectedOrderId);
    }
  }, [markOrderViewed, selectedOrderId, unreadOrderIds]);

  useEffect(() => {
    if (!isLegacyOrderConflictFeedback(orderStatus, orderMessage)) return;
    setClientFeedback({
      status: "warning",
      message: ORDER_CONFLICT_FEEDBACK_HINT
    });
    const params = filtersToSearchParams(new URLSearchParams(searchParams.toString()), filters, {
      queue,
      order: selectedKey || undefined,
      tool: createOpen ? "create" : undefined
    });
    params.delete("order_status");
    params.delete("order_message");
    router.replace(buildOrdersUrl(Object.fromEntries(params.entries())), { scroll: false });
  }, [orderStatus, orderMessage, searchParams, filters, queue, selectedKey, createOpen, router]);

  const liveSelectedOrder = useMemo(() => {
    if (!selectedOrderId) return selectedOrder;
    return liveOrders.find((order) => text(order.id) === selectedOrderId) ?? selectedOrder;
  }, [liveOrders, selectedOrder, selectedOrderId]);

  useEffect(() => {
    if (!liveSelectedOrder) return;
    const canonicalKey = orderSelectionKey(liveSelectedOrder);
    const urlKey = searchParams.get("order")?.trim() ?? "";
    if (urlKey && urlKey !== canonicalKey) {
      const params = filtersToSearchParams(new URLSearchParams(searchParams.toString()), filters, {
        queue,
        order: canonicalKey,
        tool: createOpen ? "create" : undefined
      });
      router.replace(buildOrdersUrl(Object.fromEntries(params.entries())), { scroll: false });
    }
  }, [liveSelectedOrder, searchParams, filters, queue, createOpen, router]);

  const catalogProducts = useMemo(
    () =>
      products
        .map((product) => ({
          slug: text(product.slug),
          name: text(product.name, text(product.slug)),
          price: Number(product.price ?? 0) || 0,
          chargeTax: product.charge_tax !== false,
          taxRate: product.tax_rate != null ? Number(product.tax_rate) : null,
          taxIncluded: Boolean(product.tax_included),
          taxGroup: text(product.tax_group) || null
        }))
        .filter((product) => product.slug),
    [products]
  );

  const filteredOrders = useMemo(() => {
    const filtered = filterOrders(liveOrders, liveOrderItems, queue, filters, defaultWarehouseCode);
    return sortOrders(filtered, filters.sort);
  }, [liveOrders, liveOrderItems, queue, filters, defaultWarehouseCode]);

  const replaceOrdersUrl = useCallback(
    (url: string) => {
      router.replace(url, { scroll: false });
    },
    [router]
  );

  const syncFilters = useCallback(
    (patch: Partial<OrderFilterState>) => {
      const nextFilters = { ...filters, ...patch };
      const params = filtersToSearchParams(new URLSearchParams(searchParams.toString()), nextFilters, {
        queue,
        order: selectedKey || undefined,
        tool: createOpen ? "create" : undefined
      });
      replaceOrdersUrl(buildOrdersUrl(Object.fromEntries(params.entries())));
    },
    [filters, searchParams, queue, selectedKey, createOpen, replaceOrdersUrl]
  );

  const openCreate = useCallback(() => {
    const params = filtersToSearchParams(new URLSearchParams(searchParams.toString()), filters, {
      queue,
      order: selectedKey || undefined,
      tool: "create"
    });
    replaceOrdersUrl(buildOrdersUrl(Object.fromEntries(params.entries())));
  }, [filters, queue, replaceOrdersUrl, searchParams, selectedKey]);

  const closeCreate = useCallback(() => {
    const params = filtersToSearchParams(new URLSearchParams(searchParams.toString()), filters, {
      queue,
      order: selectedKey || undefined
    });
    replaceOrdersUrl(buildOrdersUrl(Object.fromEntries(params.entries())));
  }, [filters, queue, replaceOrdersUrl, searchParams, selectedKey]);

  const orderHref = useCallback(
    (orderNumber: string) => {
      const params = filtersToSearchParams(new URLSearchParams(searchParams.toString()), filters, {
        queue,
        order: orderNumber,
        tool: createOpen ? "create" : undefined
      });
      return buildOrdersUrl(Object.fromEntries(params.entries()));
    },
    [filters, queue, searchParams, createOpen]
  );

  const selectOrder = useCallback(
    (orderNumber: string) => {
      replaceOrdersUrl(orderHref(orderNumber));
    },
    [orderHref, replaceOrdersUrl]
  );

  const clearSelection = useCallback(() => {
    const params = filtersToSearchParams(new URLSearchParams(searchParams.toString()), filters, { queue });
    replaceOrdersUrl(buildOrdersUrl(Object.fromEntries(params.entries())));
  }, [filters, queue, replaceOrdersUrl, searchParams]);

  useEffect(() => {
    function onShowShortcuts() {
      setShortcutsOpen(true);
    }
    window.addEventListener("admin-orders-show-shortcuts", onShowShortcuts);
    return () => window.removeEventListener("admin-orders-show-shortcuts", onShowShortcuts);
  }, []);

  useAdminOrdersKeyboard({
    orders: filteredOrders,
    selectedKey,
    selectedOrderId,
    selectOrder,
    createDrawerOpen: createOpen,
    onOpenCreate: openCreate,
    onCloseCreate: closeCreate,
    onClearSelection: clearSelection,
    focusedIndex,
    onFocusIndex: setFocusedIndex
  });

  const feedbackStatus = clientFeedback?.status ?? orderStatus;
  const feedbackMessage = clientFeedback?.message ?? orderMessage;
  const showFeedback =
    feedbackStatus === "success" ||
    feedbackStatus === "error" ||
    feedbackStatus === "warning" ||
    feedbackStatus === "conflict" ||
    Boolean(feedbackMessage);

  return (
    <>
      {showFeedback ? (
        <div data-order-transition-feedback>
          <OperationalFeedback
            status={feedbackStatus}
            message={feedbackMessage}
            context="Order workflow"
          />
        </div>
      ) : null}

      <AdminOrdersOptimisticProvider
        orders={filteredOrders}
        onActionFeedback={(feedback) => setClientFeedback(feedback)}
      >
        {(optimisticOrders) => {
          const activeOrder = selectedOrderId
            ? optimisticOrders.find((order) => text(order.id) === selectedOrderId) ?? liveSelectedOrder
            : liveSelectedOrder;
          const activeItems = activeOrder ? orderItemsForOrder(selectedOrderId, liveOrderItems) : [];
          const activeShipments = activeOrder
            ? liveShipments.filter((shipment) => text(shipment.order_id) === selectedOrderId)
            : [];
          const activeFirstItem = activeItems[0] ?? null;

          return (
          <AdminOrdersShell
            hasSelectedOrder={Boolean(activeOrder)}
            header={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="grid min-w-0 gap-0.5">
                  <p className="platform-type-eyebrow">Fulfillment</p>
                  <h2 className="platform-type-page-title">Orders</h2>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShortcutsOpen(true)}
                    className="platform-btn-ghost platform-btn-md"
                    title="Keyboard shortcuts"
                  >
                    ?
                  </button>
                  <button
                    type="button"
                    onClick={openCreate}
                    className="platform-btn-primary platform-btn-md"
                  >
                    Create order
                  </button>
                </div>
              </div>
            }
            filters={
              <AdminOrdersFilterBar filters={filters} warehouses={warehouses} onChange={syncFilters} />
            }
            toolbar={
              <AdminOrdersToolbar
                orders={liveOrders}
                queue={queue}
                selectedKey={selectedKey}
                filtersQuery={filters.query}
                sort={filters.sort}
                snapshotLimitWarning={snapshotLimitWarning}
              />
            }
            list={
              <AdminOrderList
                orders={optimisticOrders}
                orderItems={liveOrderItems}
                products={products}
                shipments={liveShipments}
                defaultWarehouseCode={defaultWarehouseCode}
                unreadOrderIds={unreadOrderIds}
                selectedKey={selectedKey}
                selectedOrderId={selectedOrderId}
                buildOrderHref={orderHref}
                onSelectOrder={selectOrder}
                blockedReason={blockedReason}
                focusedIndex={focusedIndex}
                onFocusIndex={setFocusedIndex}
                queue={queue}
                query={filters.query}
                cancelAdminOrderAction={cancelAdminOrderAction}
                permanentDeleteAdminOrderAction={permanentDeleteAdminOrderAction}
              />
            }
            detail={
              activeOrder ? (
                <AdminOrderDetailPanel orderId={selectedOrderId}>
                  <AdminOrderDetail
                    order={activeOrder}
                    orderId={selectedOrderId}
                    allOrders={liveOrders}
                    orderItems={liveOrderItems}
                    products={products}
                    inventory={liveInventory}
                    shipments={liveShipments}
                    catalogProducts={catalogProducts}
                    defaultWarehouseCode={defaultWarehouseCode}
                    queue={queue}
                    filtersQuery={filters.query}
                    onSelectOrder={selectOrder}
                    onClearSelection={clearSelection}
                    updateOrderShippingAddressAction={updateOrderShippingAddressAction}
                    addOrderItemsAction={addOrderItemsAction}
                    removeOrderItemAction={removeOrderItemAction}
                  />
                </AdminOrderDetailPanel>
              ) : (
                <AdminOrderDetailEmpty />
              )
            }
            actions={
              activeOrder ? (
                <AdminOrderActionsRail
                  order={activeOrder}
                  orderId={selectedOrderId}
                  queue={queue}
                  query={filters.query}
                  warehouses={warehouses}
                  defaultWarehouseCode={defaultWarehouseCode}
                  firstItem={activeFirstItem}
                  selectedShipments={activeShipments}
                  confirmAdminOrderAction={confirmAdminOrderAction}
                  rejectAdminOrderAction={rejectAdminOrderAction}
                  cancelAdminOrderAction={cancelAdminOrderAction}
                  permanentDeleteAdminOrderAction={permanentDeleteAdminOrderAction}
                  assignAdminWarehouseAction={assignAdminWarehouseAction}
                  markOrderPaidAdminOrderAction={markOrderPaidAdminOrderAction}
                  markOrderRefundedAdminOrderAction={markOrderRefundedAdminOrderAction}
                  setOrderPaymentRequirementAdminOrderAction={setOrderPaymentRequirementAdminOrderAction}
                  updateAdminOrderLifecycleAction={updateAdminOrderLifecycleAction}
                  confirmAdminWarehouseHandoffAction={confirmAdminWarehouseHandoffAction}
                />
              ) : null
            }
          />
          );
        }}
      </AdminOrdersOptimisticProvider>

      <AdminOrderCreateDrawer
        open={createOpen}
        onClose={closeCreate}
        products={catalogProducts}
        defaultWarehouseCode={defaultWarehouseCode}
        createAction={createAdminManualOrderAction}
      />

      <ShortcutsLegend open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}
