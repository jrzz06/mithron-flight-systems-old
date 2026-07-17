"use client";

import { useControlPlaneLiveSync } from "@/components/control-plane/use-control-plane-live-sync";

const TRIGGER_TABLES = new Set([
  "mithron_products",
  "notifications",
  "inventory",
  "warehouse_stock",
  "activity_logs"
]);

function shouldRefreshSupplierPortal(table: string) {
  return TRIGGER_TABLES.has(table);
}

export function SupplierLiveSync({ enabled = true }: { enabled?: boolean }) {
  useControlPlaneLiveSync(
    "supplier",
    shouldRefreshSupplierPortal,
    enabled
  );

  if (!enabled) return null;

  return <div data-supplier-live-sync className="sr-only" aria-hidden="true" />;
}
