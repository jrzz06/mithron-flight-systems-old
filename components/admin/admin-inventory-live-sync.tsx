"use client";

import { useAdminLiveResource } from "@/components/admin/realtime/admin-realtime-provider";

export function AdminInventoryLiveSync({ enabled = true }: { enabled?: boolean }) {
  useAdminLiveResource("inventory", enabled);
  if (!enabled) return null;
  return <div data-admin-inventory-live-sync className="sr-only" aria-hidden="true" />;
}
