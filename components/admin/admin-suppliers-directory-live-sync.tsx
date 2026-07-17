"use client";

import { useAdminLiveResource } from "@/components/admin/realtime/admin-realtime-provider";

export function AdminSuppliersDirectoryLiveSync({ enabled = true }: { enabled?: boolean }) {
  useAdminLiveResource("suppliers", enabled);
  if (!enabled) return null;
  return <div data-admin-suppliers-directory-live-sync className="sr-only" aria-hidden="true" />;
}
