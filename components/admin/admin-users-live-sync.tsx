"use client";

import { useAdminLiveResource } from "@/components/admin/realtime/admin-realtime-provider";

export function AdminUsersLiveSync({ enabled = true }: { enabled?: boolean }) {
  useAdminLiveResource("users", enabled);
  if (!enabled) return null;
  return <div data-admin-users-live-sync className="sr-only" aria-hidden="true" />;
}
