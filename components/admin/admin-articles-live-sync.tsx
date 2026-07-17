"use client";

import { useAdminLiveResource } from "@/components/admin/realtime/admin-realtime-provider";

export function AdminArticlesLiveSync({ enabled = true }: { enabled?: boolean }) {
  useAdminLiveResource("articles", enabled);
  if (!enabled) return null;
  return <div data-admin-articles-live-sync className="sr-only" aria-hidden="true" />;
}
