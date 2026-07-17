"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { subscribeControlPlaneLiveSync } from "@/lib/control-plane/shared-live-sync-coordinator";
import type { EnterpriseRealtimeScope } from "@/services/enterprise-realtime";

/**
 * Shared live-sync hook.
 * Admin scope never calls router.refresh(). Store patches come from AdminRealtimeProvider;
 * optional onAfterRefresh remains for targeted JSON fetches (e.g. nav metrics).
 */
export function useControlPlaneLiveSync(
  scope: EnterpriseRealtimeScope,
  shouldRefresh: (table: string) => boolean,
  enabled = true,
  onAfterRefresh?: () => void
) {
  const router = useRouter();
  const isAdminNoRefresh = scope === "admin";

  useEffect(() => {
    if (!enabled) return undefined;

    return subscribeControlPlaneLiveSync(scope, shouldRefresh, {
      onAfterRefresh,
      routerRefresh: isAdminNoRefresh ? undefined : () => router.refresh(),
      preferReconcile: isAdminNoRefresh
    });
  }, [enabled, isAdminNoRefresh, onAfterRefresh, router, scope, shouldRefresh]);
}
