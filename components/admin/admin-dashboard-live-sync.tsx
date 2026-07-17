"use client";

import { useAdminLiveResource } from "@/components/admin/realtime/admin-realtime-provider";

export function AdminDashboardLiveSync({ enabled = true }: { enabled?: boolean }) {
  useAdminLiveResource("dashboard", enabled);
  useAdminLiveResource("nav_metrics", enabled);
  if (!enabled) return null;
  return <div data-admin-dashboard-live-sync className="sr-only" aria-hidden="true" />;
}
