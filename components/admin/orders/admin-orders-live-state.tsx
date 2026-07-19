"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { subscribeSharedEnterpriseRealtime } from "@/lib/control-plane/shared-enterprise-realtime";
import {
  applyAuthoritativeOrderItems,
  applyAuthoritativeOrderRow,
  mergeOrderItemsFromRealtimeEvent,
  mergeOrdersFromRealtimeEvent,
  type AdminOrderRow
} from "@/lib/admin/orders-live-merge";
import {
  useAdminLiveResource,
  useOptionalAdminRealtime
} from "@/components/admin/realtime/admin-realtime-provider";

type AdminOrdersLiveStateContextValue = {
  liveOrders: AdminOrderRow[];
  liveOrderItems: AdminOrderRow[];
  /** Bumps when a payments realtime event arrives for an order (keyed by order id). */
  paymentVersionByOrderId: Record<string, number>;
  patchOrder: (orderId: string, row: AdminOrderRow) => void;
  patchOrderItems: (orderId: string, items: AdminOrderRow[]) => void;
  appendOptimisticOrderItems: (items: AdminOrderRow[]) => void;
  getOrder: (orderId: string) => AdminOrderRow | undefined;
  getPaymentVersion: (orderId: string) => number;
};

const AdminOrdersLiveStateContext = createContext<AdminOrdersLiveStateContextValue | null>(null);

const PAYMENT_VERSION_LRU_MAX = 200;

function bumpPaymentVersion(current: Record<string, number>, orderId: string): Record<string, number> {
  const next: Record<string, number> = {
    ...current,
    [orderId]: (current[orderId] ?? 0) + 1
  };
  const keys = Object.keys(next);
  if (keys.length <= PAYMENT_VERSION_LRU_MAX) return next;

  // Drop oldest keys first (insertion order), keeping the bumped orderId.
  const overflow = keys.length - PAYMENT_VERSION_LRU_MAX;
  let removed = 0;
  for (const key of keys) {
    if (removed >= overflow) break;
    if (key === orderId) continue;
    delete next[key];
    removed += 1;
  }
  return next;
}

export function AdminOrdersLiveStateProvider({
  orders,
  orderItems = [],
  enabled = true,
  children
}: {
  orders: AdminOrderRow[];
  orderItems?: AdminOrderRow[];
  enabled?: boolean;
  children: ReactNode;
}) {
  const realtime = useOptionalAdminRealtime();
  const useSharedStore = Boolean(realtime) && enabled;
  useAdminLiveResource("orders", useSharedStore);

  const [localOrders, setLocalOrders] = useState(orders);
  const [localOrderItems, setLocalOrderItems] = useState(orderItems);
  const [paymentVersionByOrderId, setPaymentVersionByOrderId] = useState<Record<string, number>>({});
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!useSharedStore || !realtime) return;
    if (hydratedRef.current) return;
    realtime.hydrateResource("orders", {
      orders,
      order_items: orderItems
    });
    hydratedRef.current = true;
  }, [orderItems, orders, realtime, useSharedStore]);

  useEffect(() => {
    if (useSharedStore) return;
    setLocalOrders(orders);
  }, [orders, useSharedStore]);

  useEffect(() => {
    if (useSharedStore) return;
    setLocalOrderItems(orderItems);
  }, [orderItems, useSharedStore]);

  useEffect(() => {
    if (useSharedStore || !enabled) return undefined;

    return subscribeSharedEnterpriseRealtime("admin", {
      onEvent: (event) => {
        if (event.table === "orders") {
          setLocalOrders((current) => mergeOrdersFromRealtimeEvent(current, event.record, event.eventType));
          return;
        }
        if (event.table === "order_items") {
          setLocalOrderItems((current) =>
            mergeOrderItemsFromRealtimeEvent(current, event.record, event.eventType)
          );
          return;
        }
        if (event.table === "payments") {
          const orderId =
            event.record && typeof event.record === "object"
              ? String((event.record as AdminOrderRow).order_id ?? "").trim()
              : "";
          if (!orderId) return;
          setPaymentVersionByOrderId((current) => bumpPaymentVersion(current, orderId));
        }
      }
    });
  }, [enabled, useSharedStore]);

  // Shared realtime bus (ref-counted): listen for payments to bump paymentVersion
  // without opening a second WebSocket. Local-only mode handles payments above.
  useEffect(() => {
    if (!useSharedStore || !realtime) return undefined;

    return subscribeSharedEnterpriseRealtime("admin", {
      onEvent: (event) => {
        if (event.table !== "payments") return;
        const orderId =
          event.record && typeof event.record === "object"
            ? String((event.record as AdminOrderRow).order_id ?? "").trim()
            : "";
        if (!orderId) return;
        setPaymentVersionByOrderId((current) => bumpPaymentVersion(current, orderId));
      }
    });
  }, [realtime, useSharedStore]);

  const storeOrders = realtime?.collections.orders as AdminOrderRow[] | undefined;
  const storeOrderItems = realtime?.collections.order_items as AdminOrderRow[] | undefined;

  const liveOrders = useMemo(() => {
    if (useSharedStore) {
      return storeOrders?.length ? storeOrders : orders;
    }
    return localOrders;
  }, [localOrders, orders, storeOrders, useSharedStore]);

  const liveOrderItems = useMemo(() => {
    if (useSharedStore) {
      return storeOrderItems?.length ? storeOrderItems : orderItems;
    }
    return localOrderItems;
  }, [localOrderItems, orderItems, storeOrderItems, useSharedStore]);

  const patchOrder = useCallback(
    (orderId: string, row: AdminOrderRow) => {
      const next = { ...row, id: orderId };
      if (useSharedStore && realtime) {
        realtime.patchCollection("orders", [next]);
        return;
      }
      setLocalOrders((current) => applyAuthoritativeOrderRow(current, next));
    },
    [realtime, useSharedStore]
  );

  const patchOrderItems = useCallback(
    (orderId: string, items: AdminOrderRow[]) => {
      if (useSharedStore && realtime) {
        const current = (realtime.getCollection("order_items") as AdminOrderRow[]).filter(
          (item) => String(item.order_id ?? "") !== orderId
        );
        realtime.patchCollection("order_items", [...current, ...items], { replaceAll: true });
        return;
      }
      setLocalOrderItems((current) => applyAuthoritativeOrderItems(current, orderId, items));
    },
    [realtime, useSharedStore]
  );

  const appendOptimisticOrderItems = useCallback(
    (items: AdminOrderRow[]) => {
      if (!items.length) return;
      if (useSharedStore && realtime) {
        realtime.patchCollection("order_items", items);
        return;
      }
      setLocalOrderItems((current) => {
        const next = [...current];
        for (const item of items) {
          const id = String(item.id ?? "");
          if (id && next.some((row) => String(row.id ?? "") === id)) continue;
          next.push(item);
        }
        return next;
      });
    },
    [realtime, useSharedStore]
  );

  const getOrder = useCallback(
    (orderId: string) => liveOrders.find((order) => String(order.id ?? "") === orderId),
    [liveOrders]
  );

  const getPaymentVersion = useCallback(
    (orderId: string) => paymentVersionByOrderId[orderId] ?? 0,
    [paymentVersionByOrderId]
  );

  const value = useMemo(
    () => ({
      liveOrders,
      liveOrderItems,
      paymentVersionByOrderId,
      patchOrder,
      patchOrderItems,
      appendOptimisticOrderItems,
      getOrder,
      getPaymentVersion
    }),
    [
      liveOrders,
      liveOrderItems,
      paymentVersionByOrderId,
      patchOrder,
      patchOrderItems,
      appendOptimisticOrderItems,
      getOrder,
      getPaymentVersion
    ]
  );

  return (
    <AdminOrdersLiveStateContext.Provider value={value}>
      {children}
    </AdminOrdersLiveStateContext.Provider>
  );
}

export function useAdminOrdersLiveState() {
  const context = useContext(AdminOrdersLiveStateContext);
  if (!context) {
    throw new Error("useAdminOrdersLiveState must be used within AdminOrdersLiveStateProvider");
  }
  return context;
}
