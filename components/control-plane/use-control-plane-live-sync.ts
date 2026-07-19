"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { subscribeControlPlaneLiveSync } from "@/lib/control-plane/shared-live-sync-coordinator";
import type { EnterpriseRealtimeScope } from "@/services/enterprise-realtime";

/** Coalesce router.refresh storms — same eventual UI, fewer concurrent RSC trees. */
const ROUTER_REFRESH_COALESCE_MS = 8_000;

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
  const lastRefreshAtRef = useRef(0);
  const pendingRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const scheduleRefresh = () => {
      const now = Date.now();
      const elapsed = now - lastRefreshAtRef.current;
      if (elapsed >= ROUTER_REFRESH_COALESCE_MS) {
        lastRefreshAtRef.current = now;
        router.refresh();
        return;
      }
      if (pendingRefreshRef.current) return;
      pendingRefreshRef.current = setTimeout(() => {
        pendingRefreshRef.current = null;
        lastRefreshAtRef.current = Date.now();
        router.refresh();
      }, ROUTER_REFRESH_COALESCE_MS - elapsed);
    };

    return subscribeControlPlaneLiveSync(scope, shouldRefresh, {
      onAfterRefresh,
      routerRefresh: isAdminNoRefresh ? undefined : scheduleRefresh,
      preferReconcile: isAdminNoRefresh
    });
  }, [enabled, isAdminNoRefresh, onAfterRefresh, router, scope, shouldRefresh]);

  useEffect(() => {
    return () => {
      if (pendingRefreshRef.current) {
        clearTimeout(pendingRefreshRef.current);
        pendingRefreshRef.current = null;
      }
    };
  }, []);
}
