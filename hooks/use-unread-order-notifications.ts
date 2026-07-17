"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeSharedEnterpriseRealtime } from "@/lib/control-plane/shared-enterprise-realtime";
import type { EnterpriseRealtimeScope } from "@/services/enterprise-realtime";

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Tracks which orders have unread notifications for the current user so
 * order lists can highlight "new" rows. Uses the shared multiplexed
 * realtime subscription for the scope (no extra channels) and clears the
 * highlight optimistically when an order is viewed.
 */
export function useUnreadOrderNotifications(scope?: EnterpriseRealtimeScope, enabled = true) {
  const [unreadOrderIds, setUnreadOrderIds] = useState<ReadonlySet<string>>(EMPTY_SET);
  const unreadRef = useRef<ReadonlySet<string>>(EMPTY_SET);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/notifications?unread_entities=orders")
      .then((response) => (response.ok ? response.json() : { entityIds: [] }))
      .then((payload: { entityIds?: unknown }) => {
        const ids = Array.isArray(payload.entityIds)
          ? payload.entityIds.filter((id): id is string => typeof id === "string" && Boolean(id))
          : [];
        const next: ReadonlySet<string> = new Set(ids);
        unreadRef.current = next;
        setUnreadOrderIds(next);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const deferHandle = window.setTimeout(refresh, 300);
    return () => window.clearTimeout(deferHandle);
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || !scope) return;
    const unsubscribe = subscribeSharedEnterpriseRealtime(scope, {
      onEvent: (event) => {
        if (event.table !== "notifications") return;
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(refresh, 250);
      }
    });
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      unsubscribe();
    };
  }, [enabled, refresh, scope]);

  const markOrderViewed = useCallback((orderId: string) => {
    if (!orderId || !unreadRef.current.has(orderId)) return;
    const next = new Set(unreadRef.current);
    next.delete(orderId);
    unreadRef.current = next;
    setUnreadOrderIds(next);
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: { table: "orders", id: orderId } })
    }).catch(() => undefined);
  }, []);

  return { unreadOrderIds, markOrderViewed };
}
