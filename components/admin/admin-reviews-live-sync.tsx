"use client";

import { useAdminLiveResource } from "@/components/admin/realtime/admin-realtime-provider";

export function AdminReviewsLiveSync({ enabled = true }: { enabled?: boolean }) {
  useAdminLiveResource("reviews", enabled);
  if (!enabled) return null;
  return <div data-admin-reviews-live-sync className="sr-only" aria-hidden="true" />;
}
