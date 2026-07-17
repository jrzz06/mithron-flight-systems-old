"use client";

import { useAdminLiveResource } from "@/components/admin/realtime/admin-realtime-provider";

export function AdminCmsLiveSync({ enabled = true }: { enabled?: boolean }) {
  useAdminLiveResource("cms", enabled);
  if (!enabled) return null;
  return <div data-admin-cms-live-sync className="sr-only" aria-hidden="true" />;
}
