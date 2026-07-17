"use client";

import { useAdminLiveResource } from "@/components/admin/realtime/admin-realtime-provider";

export function OrdersLiveSync({ enabled = true }: { enabled?: boolean }) {
  useAdminLiveResource("orders", enabled);
  if (!enabled) return null;
  return <div data-orders-live-sync className="sr-only" aria-hidden="true" />;
}
