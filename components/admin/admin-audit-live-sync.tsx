"use client";

import { useAdminLiveResource } from "@/components/admin/realtime/admin-realtime-provider";

export function AdminAuditLiveSync({ enabled = true }: { enabled?: boolean }) {
  useAdminLiveResource("audit", enabled);
  if (!enabled) return null;
  return <div data-admin-audit-live-sync className="sr-only" aria-hidden="true" />;
}
