"use client";

import { useAdminLiveResource } from "@/components/admin/realtime/admin-realtime-provider";

export function AdminArchivesLiveSync({ enabled = true }: { enabled?: boolean }) {
  useAdminLiveResource("archives", enabled);
  if (!enabled) return null;
  return <div data-admin-archives-live-sync className="sr-only" aria-hidden="true" />;
}
