"use client";

import { useAdminLiveResource } from "@/components/admin/realtime/admin-realtime-provider";

export function AdminProductsLiveSync({ enabled = true }: { enabled?: boolean }) {
  useAdminLiveResource("products", enabled);
  if (!enabled) return null;
  return <div data-admin-products-live-sync className="sr-only" aria-hidden="true" />;
}
