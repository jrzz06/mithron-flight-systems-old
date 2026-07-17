"use client";

import { useEffect } from "react";

/**
 * Marks all of the current user's unread notifications for an order as read
 * when its detail page is viewed (covers deep links from the notification
 * panel or email). The RPC is recipient-scoped and no-ops when nothing is
 * unread.
 */
export function OrderNotificationsReadOnView({ orderId }: { orderId: string }) {
  useEffect(() => {
    if (!orderId) return;
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: { table: "orders", id: orderId } })
    }).catch(() => undefined);
  }, [orderId]);

  return null;
}
