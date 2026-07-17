"use client";

import { useAdminLiveResource } from "@/components/admin/realtime/admin-realtime-provider";

export function EnquiryQueueLiveSync({ enabled = true }: { enabled?: boolean }) {
  useAdminLiveResource("enquiries", enabled);
  useAdminLiveResource("contact_requests", enabled);
  if (!enabled) return null;
  return <div data-enquiry-queue-live-sync className="sr-only" aria-hidden="true" />;
}
