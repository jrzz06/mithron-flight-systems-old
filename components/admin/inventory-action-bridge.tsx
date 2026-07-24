"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InventoryManager } from "@/components/admin/inventory-manager-loader";
import { notify } from "@/lib/feedback/notify";
import { markControlPlaneLiveSyncFlush } from "@/lib/control-plane/shared-live-sync-coordinator";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";
import {
  useAdminLiveResource,
  useOptionalAdminRealtime
} from "@/components/admin/realtime/admin-realtime-provider";
import type { InventoryActionResult } from "@/app/admin/inventory/actions";
import type { SimpleInventoryRow, SimpleInventoryStatus } from "@/services/simple-inventory-view";
import type { InventoryStockMetrics } from "@/services/inventory-metrics";
import type { CatalogFilter } from "@/services/csv-inventory-source";
import type { AdminEntityRow } from "@/lib/admin/realtime/admin-entity-store";

/** Client ceiling above the 55s server-side inventory timeout so the bridge surfaces server errors first. */
const INVENTORY_CLIENT_TIMEOUT_MS = 65_000;

type InventoryServerAction = (formData: FormData) => Promise<InventoryActionResult>;

type InventoryActionBridgeProps = {
  rows: SimpleInventoryRow[];
  saveAction: InventoryServerAction;
  adjustAction: InventoryServerAction;
  importAction: InventoryServerAction;
  bulkAction: InventoryServerAction;
  restockAction: InventoryServerAction;
  permanentDeleteAction?: InventoryServerAction;
  forceDeleteAction?: InventoryServerAction;
  canForceDelete?: boolean;
  exportHref: string;
  title?: string;
  page?: number;
  totalProductCount?: number;
  inventoryMetrics?: InventoryStockMetrics;
  catalogFilter?: CatalogFilter;
  hasNextPage?: boolean;
  previousPageHref?: string;
  nextPageHref?: string;
  allowCsvImport?: boolean;
  initialSearchQuery?: string;
};

function feedbackFromResult(result: InventoryActionResult) {
  if (result.status === "success") {
    notify.success(result.message, { source: "admin-inventory" });
    return;
  }
  if (result.status === "conflict") {
    notify.warning(result.message, { source: "admin-inventory" });
    return;
  }
  notify.error(result.message, { source: "admin-inventory" });
}

function mergeInventoryRow(storeRow: AdminEntityRow, fallback?: SimpleInventoryRow): SimpleInventoryRow | null {
  const productSlug = String(storeRow.productSlug ?? storeRow.product_slug ?? fallback?.productSlug ?? "").trim();
  if (!productSlug) return null;

  const quantity = Number(storeRow.quantity ?? fallback?.quantity ?? 0) || 0;
  const stockStatus = String(
    storeRow.stockStatus ?? storeRow.status ?? storeRow.stock_status ?? fallback?.stockStatus ?? "available"
  ) as SimpleInventoryStatus;

  if (fallback && fallback.productSlug === productSlug) {
    return {
      ...fallback,
      quantity,
      stockStatus,
      lastUpdated:
        typeof storeRow.lastUpdated === "string"
          ? storeRow.lastUpdated
          : typeof storeRow.updated_at === "string"
            ? storeRow.updated_at
            : fallback.lastUpdated,
      warehouseUpdatedAt:
        typeof storeRow.warehouseUpdatedAt === "string"
          ? storeRow.warehouseUpdatedAt
          : typeof storeRow.warehouse_updated_at === "string"
            ? storeRow.warehouse_updated_at
            : fallback.warehouseUpdatedAt,
      inventoryUpdatedAt:
        typeof storeRow.inventoryUpdatedAt === "string"
          ? storeRow.inventoryUpdatedAt
          : typeof storeRow.inventory_updated_at === "string"
            ? storeRow.inventory_updated_at
            : fallback.inventoryUpdatedAt,
      inventoryValue: quantity * (fallback.price || 0)
    };
  }

  return {
    id: String(storeRow.id ?? productSlug),
    productSlug,
    productName: String(storeRow.productName ?? storeRow.product_name ?? productSlug),
    productImage:
      (storeRow.productImage as string | null | undefined) ??
      (storeRow.product_image as string | null | undefined) ??
      null,
    sku: String(storeRow.sku ?? ""),
    variantId:
      (storeRow.variantId as string | null | undefined) ?? (storeRow.variant_id as string | null | undefined) ?? null,
    warehouseCode: String(storeRow.warehouseCode ?? storeRow.warehouse_code ?? ""),
    stockStatus,
    quantity,
    category: String(storeRow.category ?? ""),
    price: Number(storeRow.price ?? 0) || 0,
    inventoryValue: quantity * (Number(storeRow.price ?? 0) || 0),
    lastUpdated:
      typeof storeRow.lastUpdated === "string"
        ? storeRow.lastUpdated
        : typeof storeRow.updated_at === "string"
          ? storeRow.updated_at
          : null,
    warehouseUpdatedAt:
      typeof storeRow.warehouseUpdatedAt === "string"
        ? storeRow.warehouseUpdatedAt
        : typeof storeRow.warehouse_updated_at === "string"
          ? storeRow.warehouse_updated_at
          : null,
    inventoryUpdatedAt:
      typeof storeRow.inventoryUpdatedAt === "string"
        ? storeRow.inventoryUpdatedAt
        : typeof storeRow.inventory_updated_at === "string"
          ? storeRow.inventory_updated_at
          : null,
    supplierName: String(storeRow.supplierName ?? storeRow.supplier_name ?? ""),
    isArchived: Boolean(storeRow.isArchived ?? storeRow.is_archived ?? stockStatus === "archived")
  };
}

export function InventoryActionBridge({
  saveAction,
  adjustAction,
  importAction,
  bulkAction,
  restockAction,
  permanentDeleteAction,
  forceDeleteAction,
  canForceDelete = false,
  rows,
  ...props
}: InventoryActionBridgeProps) {
  const realtime = useOptionalAdminRealtime();
  useAdminLiveResource("inventory", Boolean(realtime));
  const hydratedRef = useRef(false);
  const [localRows, setLocalRows] = useState(rows);
  const [inlineFeedback, setInlineFeedback] = useState<{ status: string; message: string } | null>(null);

  useEffect(() => {
    setLocalRows(rows);
    if (!realtime || hydratedRef.current) return;
    realtime.hydrateResource("inventory", {
      inventory: rows as unknown as AdminEntityRow[]
    });
    hydratedRef.current = true;
  }, [realtime, rows]);

  const liveRows = useMemo(() => {
    if (!realtime) return localRows;
    const storeRows = realtime.getCollection("inventory");
    if (!storeRows.length) return localRows;
    const bySlug = new Map(localRows.map((row) => [row.productSlug, row]));
    const merged: SimpleInventoryRow[] = [];
    const seen = new Set<string>();
    for (const storeRow of storeRows) {
      const slug = String(storeRow.productSlug ?? storeRow.product_slug ?? "").trim();
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      const next = mergeInventoryRow(storeRow, bySlug.get(slug));
      if (next) merged.push(next);
    }
    for (const row of localRows) {
      if (!seen.has(row.productSlug)) merged.push(row);
    }
    return merged.length ? merged : localRows;
  }, [localRows, realtime, realtime?.collections.inventory]);

  const wrapAction = useCallback(
    (
      action: InventoryServerAction,
      successMessage?: string,
      label = "Inventory action",
      options?: { removeOnSuccess?: boolean }
    ) =>
      async (formData: FormData) => {
        try {
          const result = await raceWithTimeout(action(formData), INVENTORY_CLIENT_TIMEOUT_MS, label);
          if (successMessage && result.ok) {
            result.message = successMessage;
          }
          feedbackFromResult(result);
          setInlineFeedback(
            result.ok
              ? null
              : { status: result.status === "conflict" ? "conflict" : "error", message: result.message }
          );
          if (result.ok) {
            markControlPlaneLiveSyncFlush();
            const productSlug = String(formData.get("product_slug") ?? "").trim();
            if (options?.removeOnSuccess && productSlug) {
              setLocalRows((current) => current.filter((row) => row.productSlug !== productSlug));
              void realtime?.reconcileResources(["inventory", "products"]);
              return;
            }
            const quantity = Number(String(formData.get("quantity") ?? "").trim());
            const status = String(formData.get("status") ?? "").trim() as SimpleInventoryStatus;
            if (productSlug) {
              setLocalRows((current) =>
                current.map((row) => {
                  if (row.productSlug !== productSlug) return row;
                  const next: SimpleInventoryRow = {
                    ...row,
                    quantity: Number.isFinite(quantity) ? quantity : row.quantity,
                    stockStatus: status || row.stockStatus,
                    lastUpdated: new Date().toISOString(),
                    inventoryValue: (Number.isFinite(quantity) ? quantity : row.quantity) * row.price
                  };
                  realtime?.patchCollection("inventory", [next as unknown as AdminEntityRow]);
                  return next;
                })
              );
            }
            void realtime?.reconcileResources(["inventory"]);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Inventory action failed.";
          feedbackFromResult({ ok: false, status: "error", message });
          setInlineFeedback({ status: "error", message });
        }
      },
    [realtime]
  );

  const wrappedSave = useMemo(() => wrapAction(saveAction, undefined, "Save inventory"), [wrapAction, saveAction]);
  const wrappedAdjust = useMemo(
    () => wrapAction(adjustAction, "Stock adjusted.", "Adjust stock"),
    [wrapAction, adjustAction]
  );
  const wrappedImport = useMemo(
    () => wrapAction(importAction, undefined, "Inventory import"),
    [wrapAction, importAction]
  );
  const wrappedBulk = useMemo(
    () => wrapAction(bulkAction, undefined, "Bulk inventory update"),
    [wrapAction, bulkAction]
  );
  const wrappedRestock = useMemo(
    () => wrapAction(restockAction, undefined, "Quick restock"),
    [wrapAction, restockAction]
  );
  const wrappedPermanentDelete = useMemo(
    () =>
      permanentDeleteAction
        ? wrapAction(permanentDeleteAction, undefined, "Permanently delete product", { removeOnSuccess: true })
        : undefined,
    [wrapAction, permanentDeleteAction]
  );
  const wrappedForceDelete = useMemo(
    () =>
      forceDeleteAction
        ? wrapAction(forceDeleteAction, undefined, "Force delete product", { removeOnSuccess: true })
        : undefined,
    [wrapAction, forceDeleteAction]
  );

  return (
    <div className="grid gap-4" data-admin-inventory-live-bridge>
      {inlineFeedback ? (
        <div
          className={`rounded-[8px] border px-4 py-3 text-sm ${
            inlineFeedback.status === "conflict"
              ? "platform-feedback-warning"
              : "platform-feedback-error"
          }`}
        >
          {inlineFeedback.message}
        </div>
      ) : null}
      <InventoryManager
        {...props}
        rows={liveRows}
        action={wrappedSave}
        adjustAction={wrappedAdjust}
        importAction={wrappedImport}
        bulkAction={wrappedBulk}
        restockAction={wrappedRestock}
        permanentDeleteAction={wrappedPermanentDelete}
        forceDeleteAction={wrappedForceDelete}
        canForceDelete={canForceDelete}
      />
    </div>
  );
}
