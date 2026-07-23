"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { subscribeControlPlaneLiveSync } from "@/lib/control-plane/shared-live-sync-coordinator";
import type { EnterpriseRealtimeScope } from "@/services/enterprise-realtime";

/** Coalesce router.refresh storms — same eventual UI, fewer concurrent RSC trees. */
const ROUTER_REFRESH_COALESCE_MS = 8_000;
/** Storefront CMS/catalog edits — prefer longer coalesce to avoid full-page SSR storms. */
const STOREFRONT_ROUTER_REFRESH_COALESCE_MS = 30_000;

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
  const coalesceMs =
    scope === "storefront" ? STOREFRONT_ROUTER_REFRESH_COALESCE_MS : ROUTER_REFRESH_COALESCE_MS;
  const lastRefreshAtRef = useRef(0);
  const pendingRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const scheduleRefresh = () => {
      const now = Date.now();
      const elapsed = now - lastRefreshAtRef.current;
      if (elapsed >= coalesceMs) {
        lastRefreshAtRef.current = now;
        router.refresh();
        return;
      }
      if (pendingRefreshRef.current) return;
      pendingRefreshRef.current = setTimeout(() => {
        pendingRefreshRef.current = null;
        lastRefreshAtRef.current = Date.now();
        router.refresh();
      }, coalesceMs - elapsed);
    };

    return subscribeControlPlaneLiveSync(scope, shouldRefresh, {
      onAfterRefresh,
      routerRefresh: isAdminNoRefresh ? undefined : scheduleRefresh,
      preferReconcile: isAdminNoRefresh
    });
  }, [coalesceMs, enabled, isAdminNoRefresh, onAfterRefresh, router, scope, shouldRefresh]);

  useEffect(() => {
    return () => {
      if (pendingRefreshRef.current) {
        clearTimeout(pendingRefreshRef.current);
        pendingRefreshRef.current = null;
      }
    };
  }, []);
}
