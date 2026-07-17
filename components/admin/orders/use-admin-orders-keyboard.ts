"use client";

import { useEffect } from "react";
import {
  orderMatchesSelectionKey,
  orderSelectionKey,
  text,
  type AdminRow
} from "@/components/admin/orders/order-view-helpers";

type UseAdminOrdersKeyboardInput = {
  orders: AdminRow[];
  selectedKey: string;
  selectedOrderId: string;
  selectOrder: (orderNumber: string) => void;
  createDrawerOpen: boolean;
  onOpenCreate: () => void;
  onCloseCreate: () => void;
  onClearSelection: () => void;
  focusedIndex: number;
  onFocusIndex: (index: number) => void;
};

function isTypingTarget(target: EventTarget | null) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

export function useAdminOrdersKeyboard({
  orders,
  selectedKey,
  selectedOrderId,
  selectOrder,
  createDrawerOpen,
  onOpenCreate,
  onCloseCreate,
  onClearSelection,
  focusedIndex,
  onFocusIndex
}: UseAdminOrdersKeyboardInput) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;

      if (event.key === "Escape") {
        if (createDrawerOpen) {
          event.preventDefault();
          onCloseCreate();
          return;
        }
        if (selectedKey || selectedOrderId) {
          event.preventDefault();
          onClearSelection();
        }
        return;
      }

      if (event.key === "?" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("admin-orders-show-shortcuts"));
        return;
      }

      if (event.key === "c" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        onOpenCreate();
        return;
      }

      if (!orders.length) return;

      const currentIndex = orders.findIndex((order) =>
        orderMatchesSelectionKey(order, selectedKey, orders) || selectedOrderId === text(order.id)
      );
      const baseIndex = currentIndex >= 0 ? currentIndex : focusedIndex;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = Math.min(orders.length - 1, baseIndex < 0 ? 0 : baseIndex + 1);
        onFocusIndex(next);
        selectOrder(orderSelectionKey(orders[next]));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        const next = Math.max(0, baseIndex < 0 ? 0 : baseIndex - 1);
        onFocusIndex(next);
        selectOrder(orderSelectionKey(orders[next]));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    orders,
    selectedKey,
    selectedOrderId,
    selectOrder,
    createDrawerOpen,
    onOpenCreate,
    onCloseCreate,
    onClearSelection,
    focusedIndex,
    onFocusIndex
  ]);
}
