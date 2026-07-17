"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  useAdminLiveResource,
  useOptionalAdminRealtime
} from "@/components/admin/realtime/admin-realtime-provider";
import type { AdminEntityRow, AdminEntityTable, AdminLiveResourceId } from "@/lib/admin/realtime/admin-entity-store";

/**
 * Hydrates an admin resource from SSR snapshot rows and returns live collections.
 * After hydration, realtime + reconciliation own subsequent updates.
 */
export function useAdminHydratedResource(
  resource: AdminLiveResourceId,
  snapshot: Partial<Record<AdminEntityTable, AdminEntityRow[]>>,
  enabled = true
) {
  const realtime = useOptionalAdminRealtime();
  const live = useAdminLiveResource(resource, enabled && Boolean(realtime));
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !realtime || hydratedRef.current) return;
    realtime.hydrateResource(resource, snapshot);
    hydratedRef.current = true;
  }, [enabled, realtime, resource, snapshot]);

  const collections = useMemo(() => {
    if (!realtime || !enabled) return snapshot;
    const next: Partial<Record<AdminEntityTable, AdminEntityRow[]>> = { ...snapshot };
    for (const [table, rows] of Object.entries(live.collections)) {
      if (rows?.length) next[table as AdminEntityTable] = rows;
    }
    return next;
  }, [enabled, live.collections, realtime, snapshot]);

  return {
    enabled: live.enabled,
    connectionStatus: live.connectionStatus,
    collections,
    patchCollection: live.patchCollection,
    reconcile: live.reconcile
  };
}
