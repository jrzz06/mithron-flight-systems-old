"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { subscribeSharedEnterpriseRealtime } from "@/lib/control-plane/shared-enterprise-realtime";
import {
  ADMIN_RESOURCE_TABLES,
  applyAuthoritativeEntityRows,
  createEmptyAdminEntityCollections,
  hydrateAdminEntityCollection,
  reduceAdminEntityEvent,
  type AdminConnectionStatus,
  type AdminEntityCollections,
  type AdminEntityRow,
  type AdminEntityTable,
  type AdminLiveResourceId
} from "@/lib/admin/realtime/admin-entity-store";
import type { AdminLiveResourcePayload } from "@/lib/admin/realtime/admin-resource-registry";
import type { EnterpriseRealtimeDiagnostics, EnterpriseRealtimeTable } from "@/services/enterprise-realtime";

type ResourceRegistration = {
  resource: AdminLiveResourceId;
  tables: AdminEntityTable[];
};

type AdminRealtimeContextValue = {
  collections: AdminEntityCollections;
  connectionStatus: AdminConnectionStatus;
  diagnostics: EnterpriseRealtimeDiagnostics | null;
  activeResources: AdminLiveResourceId[];
  hydrateResource: (resource: AdminLiveResourceId, tables: Partial<Record<AdminEntityTable, AdminEntityRow[]>>) => void;
  registerResource: (resource: AdminLiveResourceId) => () => void;
  patchCollection: (table: AdminEntityTable, rows: AdminEntityRow[], options?: { replaceAll?: boolean; matchKey?: string }) => void;
  getCollection: (table: AdminEntityTable) => AdminEntityRow[];
  reconcileResources: (resources?: AdminLiveResourceId[]) => Promise<void>;
};

const AdminRealtimeContext = createContext<AdminRealtimeContextValue | null>(null);

const defaultDiagnostics: EnterpriseRealtimeDiagnostics = {
  scope: "admin",
  status: "idle",
  channelName: "enterprise-admin:pending",
  tables: [],
  subscribedAt: null,
  lastEventAt: null,
  lastReplayAt: null,
  lastError: null,
  receivedEvents: 0,
  duplicateEvents: 0,
  staleEvents: 0,
  reconnectAttempts: 0,
  subscriptionErrors: 0,
  securityAnomalies: 0
};

function mapConnectionStatus(diagnostics: EnterpriseRealtimeDiagnostics | null): AdminConnectionStatus {
  if (!diagnostics) return "idle";
  if (diagnostics.status === "connected") return "live";
  if (diagnostics.status === "reconnecting" || diagnostics.status === "connecting") return "reconnecting";
  if (diagnostics.status === "error" || diagnostics.status === "closed") return "offline";
  return "idle";
}

function applyResourcePayload(
  collections: AdminEntityCollections,
  payload: AdminLiveResourcePayload
): AdminEntityCollections {
  let next = collections;
  for (const [key, value] of Object.entries(payload.data)) {
    if (!Array.isArray(value)) continue;
    next = hydrateAdminEntityCollection(next, key as AdminEntityTable, value as AdminEntityRow[]);
  }
  return next;
}

export function AdminRealtimeProvider({
  enabled = true,
  children
}: {
  enabled?: boolean;
  children: ReactNode;
}) {
  const [collections, setCollections] = useState<AdminEntityCollections>(() => createEmptyAdminEntityCollections());
  const [diagnostics, setDiagnostics] = useState<EnterpriseRealtimeDiagnostics | null>(null);
  const [activeResources, setActiveResources] = useState<AdminLiveResourceId[]>([]);
  const registrationsRef = useRef(new Map<AdminLiveResourceId, number>());
  const reconcileInFlight = useRef(false);

  const syncActiveResources = useCallback(() => {
    setActiveResources([...registrationsRef.current.keys()]);
  }, []);

  const registerResource = useCallback(
    (resource: AdminLiveResourceId) => {
      const current = registrationsRef.current.get(resource) ?? 0;
      registrationsRef.current.set(resource, current + 1);
      syncActiveResources();
      return () => {
        const next = (registrationsRef.current.get(resource) ?? 1) - 1;
        if (next <= 0) registrationsRef.current.delete(resource);
        else registrationsRef.current.set(resource, next);
        syncActiveResources();
      };
    },
    [syncActiveResources]
  );

  const hydrateResource = useCallback(
    (resource: AdminLiveResourceId, tables: Partial<Record<AdminEntityTable, AdminEntityRow[]>>) => {
      setCollections((current) => {
        let next = current;
        for (const [table, rows] of Object.entries(tables)) {
          if (!rows) continue;
          next = hydrateAdminEntityCollection(next, table as AdminEntityTable, rows);
        }
        void resource;
        return next;
      });
    },
    []
  );

  const patchCollection = useCallback(
    (table: AdminEntityTable, rows: AdminEntityRow[], options?: { replaceAll?: boolean; matchKey?: string }) => {
      setCollections((current) => ({
        ...current,
        [table]: applyAuthoritativeEntityRows(current[table] ?? [], table, rows, options)
      }));
    },
    []
  );

  const getCollection = useCallback(
    (table: AdminEntityTable) => collections[table] ?? [],
    [collections]
  );

  const reconcileResources = useCallback(async (resources?: AdminLiveResourceId[]) => {
    if (reconcileInFlight.current) return;
    const targets = resources?.length ? resources : [...registrationsRef.current.keys()];
    if (!targets.length) return;
    reconcileInFlight.current = true;
    try {
      const payloads = await Promise.all(
        targets.map(async (resource) => {
          const response = await fetch(`/api/admin/live/${resource}`, { cache: "no-store" });
          if (!response.ok) return null;
          return (await response.json()) as AdminLiveResourcePayload;
        })
      );
      setCollections((current) => {
        let next = current;
        for (const payload of payloads) {
          if (!payload) continue;
          next = applyResourcePayload(next, payload);
        }
        return next;
      });
    } finally {
      reconcileInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    return subscribeSharedEnterpriseRealtime("admin", {
      onEvent: (event) => {
        const table = event.table as AdminEntityTable;
        const interested = [...registrationsRef.current.keys()].some((resource) =>
          (ADMIN_RESOURCE_TABLES[resource] as string[]).includes(table)
        );
        if (!interested && registrationsRef.current.size > 0) {
          // Still accept events for core collections used across admin.
        }
        setCollections((current) => reduceAdminEntityEvent(current, table, event));
      },
      onDiagnostics: setDiagnostics,
      onReplayRequired: () => {
        void reconcileResources();
      }
    });
  }, [enabled, reconcileResources]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void reconcileResources();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, reconcileResources]);

  const value = useMemo<AdminRealtimeContextValue>(
    () => ({
      collections,
      connectionStatus: mapConnectionStatus(diagnostics),
      diagnostics: diagnostics ?? defaultDiagnostics,
      activeResources,
      hydrateResource,
      registerResource,
      patchCollection,
      getCollection,
      reconcileResources
    }),
    [
      activeResources,
      collections,
      diagnostics,
      getCollection,
      hydrateResource,
      patchCollection,
      reconcileResources,
      registerResource
    ]
  );

  return <AdminRealtimeContext.Provider value={value}>{children}</AdminRealtimeContext.Provider>;
}

export function useAdminRealtime() {
  const context = useContext(AdminRealtimeContext);
  if (!context) {
    throw new Error("useAdminRealtime must be used within AdminRealtimeProvider");
  }
  return context;
}

export function useOptionalAdminRealtime() {
  return useContext(AdminRealtimeContext);
}

export function useAdminLiveResource(resource: AdminLiveResourceId, enabled = true) {
  const realtime = useOptionalAdminRealtime();

  useEffect(() => {
    if (!enabled || !realtime) return undefined;
    return realtime.registerResource(resource);
  }, [enabled, realtime, resource]);

  const tables = ADMIN_RESOURCE_TABLES[resource] ?? [];
  const collections = useMemo(() => {
    if (!realtime) return {} as Partial<Record<AdminEntityTable, AdminEntityRow[]>>;
    const next: Partial<Record<AdminEntityTable, AdminEntityRow[]>> = {};
    for (const table of tables) {
      next[table] = realtime.getCollection(table);
    }
    return next;
  }, [realtime, tables]);

  return {
    enabled: Boolean(realtime) && enabled,
    connectionStatus: realtime?.connectionStatus ?? ("idle" as AdminConnectionStatus),
    collections,
    hydrateResource: realtime?.hydrateResource,
    patchCollection: realtime?.patchCollection,
    reconcile: realtime ? () => realtime.reconcileResources([resource]) : async () => undefined
  };
}

export function AdminRealtimeStatusBadge() {
  const realtime = useOptionalAdminRealtime();
  if (!realtime) return null;
  const label =
    realtime.connectionStatus === "live"
      ? "Live"
      : realtime.connectionStatus === "reconnecting"
        ? "Reconnecting"
        : realtime.connectionStatus === "offline"
          ? "Offline"
          : "Idle";
  return (
    <span
      data-admin-realtime-status={realtime.connectionStatus}
      className="inline-flex items-center gap-1 rounded-full border border-[var(--platform-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          realtime.connectionStatus === "live"
            ? "bg-emerald-400"
            : realtime.connectionStatus === "reconnecting"
              ? "bg-amber-400"
              : realtime.connectionStatus === "offline"
                ? "bg-rose-400"
                : "bg-[var(--platform-text-muted)]"
        }`}
      />
      {label}
    </span>
  );
}

export type { ResourceRegistration, EnterpriseRealtimeTable };
