"use client";

import { useAdminLiveResource } from "@/components/admin/realtime/admin-realtime-provider";

export function AdminMediaLiveSync({ enabled = true }: { enabled?: boolean }) {
  useAdminLiveResource("media", enabled);
  if (!enabled) return null;
  return <div data-admin-media-live-sync className="sr-only" aria-hidden="true" />;
}
