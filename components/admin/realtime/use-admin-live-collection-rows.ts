"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  useAdminLiveResource,
  useOptionalAdminRealtime
} from "@/components/admin/realtime/admin-realtime-provider";
import type { AdminEntityRow, AdminEntityTable, AdminLiveResourceId } from "@/lib/admin/realtime/admin-entity-store";

function rowId(row: AdminEntityRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function mergeByIdentity(
  ssrRows: AdminEntityRow[],
  liveRows: AdminEntityRow[],
  keys: string[]
): AdminEntityRow[] {
  if (!liveRows.length) return ssrRows;
  const map = new Map<string, AdminEntityRow>();
  for (const row of ssrRows) {
    const id = rowId(row, keys);
    if (id) map.set(id, row);
  }
  for (const row of liveRows) {
    const id = rowId(row, keys);
    if (!id) continue;
    map.set(id, { ...(map.get(id) ?? {}), ...row });
  }
  return Array.from(map.values());
}

/**
 * Generic SSR → live collection adapter for admin list workspaces.
 */
export function useAdminLiveCollectionRows<T extends AdminEntityRow>(
  resource: AdminLiveResourceId,
  table: AdminEntityTable,
  ssrRows: T[],
  identityKeys: string[] = ["id"],
  enabled = true
) {
  const realtime = useOptionalAdminRealtime();
  useAdminLiveResource(resource, enabled && Boolean(realtime));
  const hydratedRef = useRef(false);
  const identityKey = identityKeys.join("|");

  useEffect(() => {
    if (!enabled || !realtime || hydratedRef.current) return;
    realtime.hydrateResource(resource, { [table]: ssrRows });
    hydratedRef.current = true;
  }, [enabled, realtime, resource, ssrRows, table]);

  return useMemo(() => {
    if (!realtime || !enabled) return ssrRows;
    const liveRows = (realtime.getCollection(table) ?? []) as AdminEntityRow[];
    return mergeByIdentity(ssrRows as AdminEntityRow[], liveRows, identityKey.split("|")) as T[];
  }, [enabled, identityKey, realtime, realtime?.collections[table], ssrRows, table]);
}
