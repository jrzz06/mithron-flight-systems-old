"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AdminTableShell } from "@/components/admin/module-panel";
import { AdminOrderListItem } from "@/components/admin/orders/admin-order-list-item";
import { orderMatchesSelectionKey, orderSelectionKey, text, type AdminRow } from "@/components/admin/orders/order-view-helpers";
import type { AdminOrderFormAction } from "@/lib/admin/order-action-result";

type AdminOrderListProps = {
  orders: AdminRow[];
  orderItems: AdminRow[];
  products: AdminRow[];
  shipments: AdminRow[];
  defaultWarehouseCode: string;
  unreadOrderIds?: ReadonlySet<string>;
  selectedKey: string;
  selectedOrderId: string;
  buildOrderHref: (orderNumber: string) => string;
  onSelectOrder: (orderNumber: string) => void;
  blockedReason?: string | null;
  focusedIndex: number;
  onFocusIndex: (index: number) => void;
  queue: string;
  query: string;
  cancelAdminOrderAction: AdminOrderFormAction;
  permanentDeleteAdminOrderAction: (formData: FormData) => Promise<void>;
};

const ESTIMATED_ROW_HEIGHT = 148;

export function AdminOrderList({
  orders,
  orderItems,
  products,
  shipments,
  defaultWarehouseCode,
  unreadOrderIds,
  selectedKey,
  selectedOrderId,
  buildOrderHref,
  onSelectOrder,
  blockedReason,
  focusedIndex,
  onFocusIndex,
  queue,
  query,
  cancelAdminOrderAction,
  permanentDeleteAdminOrderAction
}: AdminOrderListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const listScrollTopRef = useRef(0);

  // onSelectOrder's identity changes with the URL (filters/selection), which
  // would defeat React.memo on every row. Route it through a ref so rows get
  // one stable handler for the lifetime of the list.
  const onSelectOrderRef = useRef(onSelectOrder);
  useLayoutEffect(() => {
    onSelectOrderRef.current = onSelectOrder;
  }, [onSelectOrder]);
  const handleSelectKey = useCallback((selectionKey: string) => {
    onSelectOrderRef.current(selectionKey);
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: orders.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
    measureElement:
      typeof window !== "undefined" && navigator.userAgent.indexOf("Firefox") === -1
        ? (element) => element.getBoundingClientRect().height
        : undefined
  });

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;
    const onScroll = () => {
      listScrollTopRef.current = parent.scrollTop;
    };
    parent.addEventListener("scroll", onScroll, { passive: true });
    return () => parent.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;
    parent.scrollTop = listScrollTopRef.current;
  }, [selectedKey, selectedOrderId]);

  useEffect(() => {
    if (focusedIndex < 0 || focusedIndex >= orders.length) return;
    rowVirtualizer.scrollToIndex(focusedIndex, { align: "auto" });
  }, [focusedIndex, orders.length, rowVirtualizer]);

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <AdminTableShell
      title={`Orders (${orders.length})`}
      description={blockedReason ?? undefined}
      className="flex h-full min-h-0 flex-col [&>div:last-child]:flex [&>div:last-child]:min-h-0 [&>div:last-child]:flex-1 [&>div:last-child]:flex-col"
    >
      {!orders.length ? (
        <p className="px-3 py-4 text-sm text-[var(--platform-text-muted)]">No orders match this queue.</p>
      ) : (
        <div
          ref={parentRef}
          data-admin-orders-list
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        >
          <div
            className="relative w-full"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {virtualItems.map((virtualRow) => {
              const order = orders[virtualRow.index]!;
              const orderId = text(order.id);
              const selectionKey = orderSelectionKey(order);
              const isSelected =
                orderMatchesSelectionKey(order, selectedKey, orders) || selectedOrderId === orderId;
              const hasShipment = shipments.some((s) => text(s.order_id) === orderId);
              const index = virtualRow.index;

              return (
                <div
                  key={orderId || selectionKey}
                  data-index={index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <AdminOrderListItem
                    order={order}
                    orderItems={orderItems}
                    products={products}
                    defaultWarehouseCode={defaultWarehouseCode}
                    selected={isSelected}
                    unread={Boolean(unreadOrderIds?.has(orderId))}
                    isPending={Boolean(order._optimistic_pending)}
                    hasShipment={hasShipment}
                    href={buildOrderHref(selectionKey)}
                    selectionKey={selectionKey}
                    index={index}
                    onSelectKey={handleSelectKey}
                    onFocusIndex={onFocusIndex}
                    tabIndex={focusedIndex === index ? 0 : -1}
                    queue={queue}
                    query={query}
                    cancelAdminOrderAction={cancelAdminOrderAction}
                    permanentDeleteAdminOrderAction={permanentDeleteAdminOrderAction}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AdminTableShell>
  );
}
