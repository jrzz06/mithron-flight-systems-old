"use client";

import type { ReactNode } from "react";
import { AdminRealtimeProvider, AdminRealtimeStatusBadge } from "@/components/admin/realtime/admin-realtime-provider";

export function AdminRealtimeShell({
  enabled = true,
  children
}: {
  enabled?: boolean;
  children: ReactNode;
}) {
  return (
    <AdminRealtimeProvider enabled={enabled}>
      <div className="pointer-events-none fixed bottom-3 right-3 z-[120]">
        <div className="pointer-events-auto">
          <AdminRealtimeStatusBadge />
        </div>
      </div>
      {children}
    </AdminRealtimeProvider>
  );
}
