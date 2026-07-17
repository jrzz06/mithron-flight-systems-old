"use client";

import { useAdminLiveResource } from "@/components/admin/realtime/admin-realtime-provider";

export function AdminWarehousesLiveSync({ enabled = true }: { enabled?: boolean }) {
  useAdminLiveResource("warehouses", enabled);
  if (!enabled) return null;
  return <div data-admin-warehouses-live-sync className="sr-only" aria-hidden="true" />;
}
