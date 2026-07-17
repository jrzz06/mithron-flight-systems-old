"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useControlPlaneLiveSync } from "@/components/control-plane/use-control-plane-live-sync";
import { wasControlPlaneRecentlyFlushed } from "@/lib/control-plane/shared-live-sync-coordinator";
import type { PlatformScope } from "@/components/platform/types";
import type {
  AdminNavMetricsPayload,
  SupplierNavMetricsPayload,
  WarehouseNavMetricsPayload
} from "@/services/nav-metrics";

type NavMetricsPayload = Partial<AdminNavMetricsPayload & WarehouseNavMetricsPayload & SupplierNavMetricsPayload>;

type AdminNavMetrics = {
  pendingSupplierApprovals: number;
  pendingOrdersReview: number;
  newEnquiries: number;
  newContactRequests: number;
};

type WarehouseNavMetrics = {
  fulfillmentPending: number;
};

type SupplierNavMetrics = {
  pendingReview: number;
  needsAction: number;
  inventoryAlerts: number;
};

type ControlPlaneNavMetricsContextValue = {
  admin: AdminNavMetrics;
  warehouse: WarehouseNavMetrics;
  supplier: SupplierNavMetrics;
};

const defaultMetrics: ControlPlaneNavMetricsContextValue = {
  admin: {
    pendingSupplierApprovals: 0,
    pendingOrdersReview: 0,
    newEnquiries: 0,
    newContactRequests: 0
  },
  warehouse: { fulfillmentPending: 0 },
  supplier: { pendingReview: 0, needsAction: 0, inventoryAlerts: 0 }
};

const ControlPlaneNavMetricsContext = createContext<ControlPlaneNavMetricsContextValue>(defaultMetrics);

const ADMIN_METRICS_TABLES = new Set([
  "orders",
  "payments",
  "mithron_products",
  "notifications",
  "enquiries",
  "contact_requests"
]);
const WAREHOUSE_METRICS_TABLES = new Set(["orders", "order_items", "shipments", "payments", "notifications"]);
const SUPPLIER_METRICS_TABLES = new Set([
  "mithron_products",
  "notifications",
  "inventory",
  "warehouse_stock"
]);

function shouldRefreshAdminMetrics(table: string) {
  return ADMIN_METRICS_TABLES.has(table);
}

function shouldRefreshWarehouseMetrics(table: string) {
  return WAREHOUSE_METRICS_TABLES.has(table);
}

function shouldRefreshSupplierMetrics(table: string) {
  return SUPPLIER_METRICS_TABLES.has(table);
}

function metricsEndpointForScope(scope: PlatformScope) {
  if (scope === "warehouse") return "/api/warehouse/nav-metrics";
  if (scope === "supplier") return "/api/supplier/nav-metrics";
  return "/api/admin/nav-metrics";
}

function MetricsRealtimeSync({
  scope,
  onRefresh
}: {
  scope: PlatformScope;
  onRefresh: () => void;
}) {
  const shouldRefresh =
    scope === "warehouse"
      ? shouldRefreshWarehouseMetrics
      : scope === "supplier"
        ? shouldRefreshSupplierMetrics
        : shouldRefreshAdminMetrics;

  useControlPlaneLiveSync(scope, shouldRefresh, true, onRefresh);

  return null;
}

function applyMetricsPayload(scope: PlatformScope, payload: NavMetricsPayload): ControlPlaneNavMetricsContextValue {
  if (scope === "warehouse") {
    return {
      ...defaultMetrics,
      warehouse: {
        fulfillmentPending: Number(payload.fulfillmentPending ?? 0)
      }
    };
  }

  if (scope === "supplier") {
    return {
      ...defaultMetrics,
      supplier: {
        pendingReview: Number(payload.pendingReview ?? 0),
        needsAction: Number(payload.needsAction ?? 0),
        inventoryAlerts: Number(payload.inventoryAlerts ?? 0)
      }
    };
  }

  return {
    ...defaultMetrics,
    admin: {
      pendingSupplierApprovals: Number(payload.pendingSupplierApprovals ?? 0),
      pendingOrdersReview: Number(payload.pendingOrdersReview ?? 0),
      newEnquiries: Number(payload.newEnquiries ?? 0),
      newContactRequests: Number(payload.newContactRequests ?? 0)
    }
  };
}

export function ControlPlaneNavMetricsProvider({
  children,
  scope
}: {
  children: ReactNode;
  scope: PlatformScope;
}) {
  const [metrics, setMetrics] = useState<ControlPlaneNavMetricsContextValue>(defaultMetrics);

  const refreshFromRealtime = useCallback(() => {
    const endpoint = metricsEndpointForScope(scope);
    fetch(endpoint)
      .then((response) => (response.ok ? response.json() : {}))
      .then((payload: NavMetricsPayload) => {
        setMetrics((current) => ({
          ...current,
          ...applyMetricsPayload(scope, payload)
        }));
      })
      .catch(() => undefined);
  }, [scope]);

  const refreshFromPoll = useCallback(() => {
    if (wasControlPlaneRecentlyFlushed(120_000)) return;
    refreshFromRealtime();
  }, [refreshFromRealtime]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    function loadMetrics() {
      const endpoint = metricsEndpointForScope(scope);
      fetch(endpoint, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : {}))
        .then((payload: NavMetricsPayload) => {
          if (!active) return;
          setMetrics((current) => ({
            ...current,
            ...applyMetricsPayload(scope, payload)
          }));
        })
        .catch(() => undefined);
    }

    loadMetrics();
    const interval = window.setInterval(() => {
      if (!active || document.hidden) return;
      refreshFromPoll();
    }, 120_000);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [scope, refreshFromPoll]);

  useEffect(() => {
    function handleVisibility() {
      if (!document.hidden) refreshFromPoll();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refreshFromPoll]);

  const value = useMemo(
    () => metrics,
    [
      metrics.admin.pendingOrdersReview,
      metrics.admin.pendingSupplierApprovals,
      metrics.admin.newEnquiries,
      metrics.admin.newContactRequests,
      metrics.warehouse.fulfillmentPending,
      metrics.supplier.pendingReview,
      metrics.supplier.needsAction,
      metrics.supplier.inventoryAlerts
    ]
  );

  return (
    <ControlPlaneNavMetricsContext.Provider value={value}>
      <MetricsRealtimeSync scope={scope} onRefresh={refreshFromRealtime} />
      {children}
    </ControlPlaneNavMetricsContext.Provider>
  );
}

export function useControlPlaneNavMetrics() {
  return useContext(ControlPlaneNavMetricsContext);
}

/** @deprecated Use ControlPlaneNavMetricsProvider */
export const AdminNavMetricsProvider = ({ children }: { children: ReactNode }) => (
  <ControlPlaneNavMetricsProvider scope="admin">{children}</ControlPlaneNavMetricsProvider>
);

/** @deprecated Use useControlPlaneNavMetrics */
export function useAdminNavMetrics() {
  const metrics = useControlPlaneNavMetrics();
  return metrics.admin;
}
