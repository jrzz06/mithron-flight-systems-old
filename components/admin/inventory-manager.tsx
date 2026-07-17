"use client";

import Link from "next/link";
import { Archive, Download, MoreHorizontal, Pencil, Plus, Search, Upload, X } from "lucide-react";
import { createPortal } from "react-dom";
import { memo, type ReactNode, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { StatusPill } from "@/components/platform/status-pill";
import { ConfirmDialog } from "@/components/notifications/confirm-dialog";
import { getControlPlaneThemeAttrs } from "@/lib/control-plane-theme";
import type { SimpleInventoryRow, SimpleInventoryStatus } from "@/services/simple-inventory-view";
import type { InventoryStockMetrics } from "@/services/inventory-metrics";
import type { CatalogFilter } from "@/services/csv-inventory-source";

type InventoryAction = (formData: FormData) => void | Promise<void>;

type InventoryManagerProps = {
  rows: SimpleInventoryRow[];
  action?: InventoryAction;
  adjustAction?: InventoryAction;
  importAction?: InventoryAction;
  bulkAction?: InventoryAction;
  restockAction?: InventoryAction;
  readOnly?: boolean;
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

const adjustmentReasonOptions = [
  { value: "stock_in", label: "Stock in" },
  { value: "stock_out", label: "Stock out" },
  { value: "adjustment", label: "Adjustment" },
  { value: "correction", label: "Correction" },
  { value: "damaged", label: "Damaged" }
] as const;

const statusOptions: Array<{ value: SimpleInventoryStatus; label: string }> = [
  { value: "available", label: "In stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "discontinued", label: "Discontinued" },
  { value: "archived", label: "Archived" }
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}

function formatUpdated(value: string | null) {
  if (!value) return "Not updated";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

function rowSearchText(row: SimpleInventoryRow) {
  return `${row.productName} ${row.productSlug} ${row.sku} ${row.category}`.toLowerCase();
}

function rowKey(row: SimpleInventoryRow) {
  return row.productSlug;
}

function HiddenInventoryFields({
  row,
  status,
  quantity,
  includeStatus = true,
  includeQuantity = true
}: {
  row: SimpleInventoryRow;
  status?: SimpleInventoryStatus;
  quantity?: number;
  includeStatus?: boolean;
  includeQuantity?: boolean;
}) {
  return (
    <>
      <input type="hidden" name="product_slug" value={row.productSlug} />
      <input type="hidden" name="product_name" value={row.productName} />
      <input type="hidden" name="product_image" value={row.productImage ?? ""} />
      <input type="hidden" name="sku" value={row.sku} />
      <input type="hidden" name="variant_id" value={row.variantId ?? ""} />
      <input type="hidden" name="warehouse_code" value={row.warehouseCode} />
      {includeQuantity ? <input type="hidden" name="quantity" value={quantity ?? row.quantity} /> : null}
      <input type="hidden" name="category" value={row.category} />
      <input type="hidden" name="price" value={row.price} />
      {includeStatus ? <input type="hidden" name="stock_status" value={status ?? row.stockStatus} /> : null}
      {row.warehouseUpdatedAt ? <input type="hidden" name="expected_updated_at" value={row.warehouseUpdatedAt} /> : null}
      {row.inventoryUpdatedAt ? <input type="hidden" name="expected_inventory_updated_at" value={row.inventoryUpdatedAt} /> : null}
      <input type="hidden" name="change_summary" value={`Update inventory ${row.productSlug}:${row.sku}`} />
    </>
  );
}

function InventoryDialogPortal({
  children,
  onClose,
  align = "center"
}: {
  children: ReactNode;
  onClose: () => void;
  align?: "center" | "right";
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const { theme, scope } = getControlPlaneThemeAttrs();

  return createPortal(
    <div
      data-inventory-dialog-portal
      data-control-plane-theme={theme}
      {...(scope ? { "data-control-plane-scope": scope } : {})}
      className={`fixed inset-0 z-[140] flex bg-[#02040a]/72 p-3 backdrop-blur-sm transition-opacity ${align === "right" ? "items-stretch justify-end" : "items-center justify-center"}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </div>,
    document.body
  );
}

function InlineStockEditor({
  row,
  action,
  onLocalUpdate
}: {
  row: SimpleInventoryRow;
  action: InventoryAction;
  onLocalUpdate: (id: string, fields: Partial<SimpleInventoryRow>) => void;
}) {
  function updateLocal(form: HTMLFormElement) {
    const quantity = Number(new FormData(form).get("quantity") ?? row.quantity);
    if (Number.isFinite(quantity)) {
      onLocalUpdate(row.id, {
        quantity,
        inventoryValue: quantity * row.price,
        stockStatus: quantity <= 0 ? "out_of_stock" : row.stockStatus === "out_of_stock" ? "available" : row.stockStatus
      });
    }
  }

  return (
    <div data-inventory-inline-stock className="flex flex-wrap items-center gap-1.5">
      <form action={action} onSubmit={(event) => updateLocal(event.currentTarget)} className="flex items-center gap-1">
        <HiddenInventoryFields row={row} includeQuantity={false} />
        <input
          name="quantity"
          type="number"
          min={0}
          defaultValue={row.quantity}
          aria-label={`Stock quantity for ${row.productName}`}
          className="h-8 w-20 rounded-lg border border-slate-800 bg-[#0b1017] px-2 text-sm font-semibold text-slate-100 outline-none focus:border-emerald-400/70"
        />
        <OperationalSubmitButton pendingLabel="Saving" className="inline-flex h-8 items-center rounded-lg border border-slate-800 bg-white/[0.04] px-2 text-[11px] font-semibold text-slate-200 hover:border-slate-700">
          Save
        </OperationalSubmitButton>
      </form>
      <form
        action={action}
        onSubmit={() => {
          const quantity = row.quantity + 1;
          onLocalUpdate(row.id, {
            quantity,
            inventoryValue: quantity * row.price,
            stockStatus: row.stockStatus === "out_of_stock" ? "available" : row.stockStatus
          });
        }}
      >
        <HiddenInventoryFields row={row} quantity={row.quantity + 1} />
        <button
          data-inventory-increment="1"
          className="inline-flex h-8 items-center rounded-lg border border-slate-800 bg-white/[0.03] px-2 text-[11px] font-semibold text-slate-300 hover:border-emerald-400/40 hover:text-emerald-100"
        >
          +1
        </button>
      </form>
      <form
        action={action}
        onSubmit={() => {
          const quantity = row.quantity + 5;
          onLocalUpdate(row.id, {
            quantity,
            inventoryValue: quantity * row.price,
            stockStatus: row.stockStatus === "out_of_stock" ? "available" : row.stockStatus
          });
        }}
      >
        <HiddenInventoryFields row={row} quantity={row.quantity + 5} />
        <button
          data-inventory-increment="5"
          className="inline-flex h-8 items-center rounded-lg border border-slate-800 bg-white/[0.03] px-2 text-[11px] font-semibold text-slate-300 hover:border-emerald-400/40 hover:text-emerald-100"
        >
          +5
        </button>
      </form>
      <form
        action={action}
        onSubmit={() => {
          const quantity = row.quantity + 10;
          onLocalUpdate(row.id, {
            quantity,
            inventoryValue: quantity * row.price,
            stockStatus: row.stockStatus === "out_of_stock" ? "available" : row.stockStatus
          });
        }}
      >
        <HiddenInventoryFields row={row} quantity={row.quantity + 10} />
        <button
          data-inventory-increment="10"
          className="inline-flex h-8 items-center rounded-lg border border-slate-800 bg-white/[0.03] px-2 text-[11px] font-semibold text-slate-300 hover:border-emerald-400/40 hover:text-emerald-100"
        >
          +10
        </button>
      </form>
    </div>
  );
}

const InventoryRow = memo(function InventoryRow({
  row,
  selected,
  menuOpen,
  action,
  readOnly = false,
  onSelect,
  onAdjustStock,
  onMenuToggle,
  onLocalUpdate
}: {
  row: SimpleInventoryRow;
  selected: boolean;
  menuOpen: boolean;
  action?: InventoryAction;
  readOnly?: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onAdjustStock: (row: SimpleInventoryRow) => void;
  onMenuToggle: (id: string) => void;
  onLocalUpdate: (id: string, fields: Partial<SimpleInventoryRow>) => void;
}) {
  const archiveFormRef = useRef<HTMLFormElement | null>(null);
  const archiveConfirmedRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <tr data-inventory-row className={`content-visibility-auto group border-b border-slate-800/70 text-sm [contain-intrinsic-size:72px] [content-visibility:auto] ${menuOpen ? "relative z-30" : ""}`}>
      <td className="w-10 px-3 py-2.5">
        {!readOnly ? (
        <input
          type="checkbox"
          aria-label={`Select ${row.productName}`}
          checked={selected}
          onChange={(event) => onSelect(rowKey(row), event.currentTarget.checked)}
          className="h-4 w-4 rounded border-slate-700 bg-[#0b1017]"
        />
        ) : null}
      </td>
      <td className="min-w-[150px] px-3 py-2.5 font-mono text-xs text-slate-300">{row.sku}</td>
      <td className="min-w-[220px] px-3 py-2.5">
        <Link href={`/admin/products?product_slug=${encodeURIComponent(row.productSlug)}`} className="max-w-[320px] truncate font-semibold text-slate-100 hover:text-emerald-200">
          {row.productName}
        </Link>
        <p className="mt-0.5 truncate text-xs text-slate-500">{row.productSlug}</p>
        {row.isArchived ? (
          <span className="mt-1 inline-flex rounded-md bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200 ring-1 ring-rose-400/20">
            Archived
          </span>
        ) : null}
      </td>
      <td className="min-w-[120px] px-3 py-2.5 text-xs text-slate-400">{row.warehouseCode || "—"}</td>
      <td className="min-w-[90px] px-3 py-2.5 text-sm text-slate-200">{formatNumber(row.quantity)}</td>
      <td className="min-w-[132px] px-3 py-2.5">
        <StatusPill status={row.stockStatus} />
      </td>
      <td className="min-w-[140px] px-3 py-2.5 text-xs text-slate-500">{formatUpdated(row.lastUpdated)}</td>
      {readOnly ? null : (
      <td className="sticky right-0 min-w-[72px] bg-[#0f141b] px-3 py-2.5">
        <div className="flex items-center justify-end">
          <div className="relative" data-inventory-action-menu>
            <button
              type="button"
              aria-label={`More actions for ${row.productName}`}
              aria-expanded={menuOpen}
              onClick={() => onMenuToggle(row.id)}
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-700 bg-[#151c26] text-slate-300 hover:border-slate-600"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
            {menuOpen && action ? (
              <div className="absolute right-0 top-9 z-[95] grid w-48 gap-1 rounded-xl border border-slate-800 bg-[#10151d] p-2 text-xs shadow-2xl shadow-black/30">
                <Link
                  href={`/admin/products?product_slug=${encodeURIComponent(row.productSlug)}`}
                  data-inventory-action="edit"
                  className="inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 font-semibold text-slate-300 hover:bg-[#151c26] hover:text-slate-100"
                  onClick={() => onMenuToggle(row.id)}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </Link>
                <button
                  type="button"
                  data-inventory-action="stock"
                  aria-label="Adjust stock"
                  onClick={() => onAdjustStock(row)}
                  className="inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-semibold text-slate-300 hover:bg-[#151c26] hover:text-slate-100"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Adjust stock
                </button>
                <div className="my-0.5 border-t border-slate-800" aria-hidden="true" />
                <form
                  action={action}
                  ref={archiveFormRef}
                  onSubmit={(event) => {
                    if (!archiveConfirmedRef.current) {
                      event.preventDefault();
                      setConfirmOpen(true);
                      return;
                    }
                    archiveConfirmedRef.current = false;
                  }}
                >
                  <HiddenInventoryFields row={row} status="archived" />
                  <button data-inventory-action="archive" className="inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-semibold text-slate-300 hover:bg-[#151c26] hover:text-slate-100">
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                    Archive
                  </button>
                </form>
                <ConfirmDialog
                  open={confirmOpen}
                  title="Archive product?"
                  description={`Archive ${row.productName}? Stock history and warehouse data will be preserved.`}
                  confirmLabel="Archive"
                  variant="danger"
                  onClose={() => {
                    archiveConfirmedRef.current = false;
                    setConfirmOpen(false);
                  }}
                  onConfirm={() => {
                    archiveConfirmedRef.current = true;
                    setConfirmOpen(false);
                    onLocalUpdate(row.id, { stockStatus: "archived", isArchived: true });
                    archiveFormRef.current?.requestSubmit();
                  }}
                />
                <a
                  data-inventory-action="view"
                  href={`/product/${row.productSlug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 font-semibold text-slate-300 hover:bg-[#151c26] hover:text-slate-100"
                >
                  View product
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </td>
      )}
    </tr>
  );
});

export function InventoryManager({
  rows,
  action,
  adjustAction,
  importAction,
  bulkAction,
  restockAction,
  readOnly = false,
  exportHref,
  title = "Inventory",
  page = 1,
  totalProductCount,
  inventoryMetrics,
  catalogFilter = "all",
  hasNextPage = false,
  previousPageHref,
  nextPageHref,
  allowCsvImport = true,
  initialSearchQuery = ""
}: InventoryManagerProps) {
  const [query, setQuery] = useState(initialSearchQuery);
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState<"all" | SimpleInventoryStatus>("all");
  const [stockRangeFilter, setStockRangeFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [adjustingRow, setAdjustingRow] = useState<SimpleInventoryRow | null>(null);
  const [adjustmentMode, setAdjustmentMode] = useState<"increase" | "decrease" | "replace">("increase");
  const [bulkDrawerOpen, setBulkDrawerOpen] = useState(false);
  const [restockAmount, setRestockAmount] = useState(10);
  const [overrides, setOverrides] = useState<Record<string, Partial<SimpleInventoryRow>>>({});
  const mergedRows = useMemo(
    () => rows.map((row) => ({ ...row, ...(overrides[row.id] ?? {}) })),
    [overrides, rows]
  );
  const filteredRows = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return mergedRows.filter((row) => {
      const matchesSearch = normalizedQuery ? rowSearchText(row).includes(normalizedQuery) : true;
      const matchesStatus = statusFilter === "all" ? true : row.stockStatus === statusFilter;
      const matchesRange = stockRangeFilter === "all"
        ? true
        : stockRangeFilter === "zero"
          ? row.quantity <= 0
          : stockRangeFilter === "low"
            ? row.quantity > 0 && row.quantity <= 5
            : row.quantity > 10;
      return matchesSearch && matchesStatus && matchesRange;
    });
  }, [deferredQuery, mergedRows, statusFilter, stockRangeFilter]);
  const visibleRows = filteredRows;
  const mobileRowVirtualizer = useWindowVirtualizer({
    count: visibleRows.length,
    estimateSize: () => 220,
    overscan: 3
  });

  // Stable callbacks so the memoized InventoryRow doesn't rerender every row
  // whenever unrelated state (query, filters, menus) changes.
  const updateSelected = useCallback((id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const updateRow = useCallback((id: string, fields: Partial<SimpleInventoryRow>) => {
    setOverrides((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? {}),
        ...fields
      }
    }));
  }, []);

  const openAdjustStock = useCallback((nextRow: SimpleInventoryRow) => {
    setOpenMenuId(null);
    setAdjustmentMode("increase");
    setAdjustingRow(nextRow);
  }, []);

  const toggleRowMenu = useCallback((id: string) => {
    setOpenMenuId((current) => (current === id ? null : id));
  }, []);

  function applyAdjustStock(form: HTMLFormElement) {
    if (!adjustingRow) return;
    const formData = new FormData(form);
    const mode = String(formData.get("adjustment_mode") ?? "replace") as "increase" | "decrease" | "replace";
    const adjustmentQuantity = Number(formData.get("adjustment_quantity") ?? 0);
    const currentQuantity = adjustingRow.quantity;
    let nextQuantity = currentQuantity;

    if (mode === "increase") {
      nextQuantity = currentQuantity + adjustmentQuantity;
    } else if (mode === "decrease") {
      nextQuantity = Math.max(0, currentQuantity - adjustmentQuantity);
    } else {
      nextQuantity = adjustmentQuantity;
    }

    updateRow(adjustingRow.id, {
      quantity: nextQuantity,
      inventoryValue: nextQuantity * adjustingRow.price,
      stockStatus: nextQuantity <= 0 ? "out_of_stock" : "available"
    });
    setAdjustingRow(null);
  }

  return (
    <section data-inventory-system className="mithron-elevated-card grid gap-3 rounded-xl border border-slate-800 bg-[#0f141b] p-3 text-slate-100 md:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Stock control</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-100">
            {title}{" "}
            <span className="text-slate-500">
              {formatNumber(filteredRows.length)} on this page
              {typeof totalProductCount === "number" ? ` · ${formatNumber(totalProductCount)} products total` : ""}
            </span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={exportHref}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-[#151c26] px-3 text-xs font-semibold text-slate-100 hover:border-slate-600"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export
          </a>
        </div>
      </div>

      {!readOnly && restockAction ? (
        <div
          data-inventory-restock-minibar
          className="sticky top-0 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-950/25 p-2 backdrop-blur-sm"
        >
          <span className="inline-flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-200/90">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Quick restock
          </span>
          <label className="inline-flex items-center gap-2 text-xs text-slate-400">
            Add
            <input
              type="number"
              min={1}
              max={10000}
              value={restockAmount}
              onChange={(event) => setRestockAmount(Math.max(1, Number(event.currentTarget.value) || 1))}
              className="h-9 w-20 rounded-lg border border-slate-700 bg-[#0b1017] px-2 text-sm font-semibold text-slate-100"
            />
            to each product
          </label>
          <form action={restockAction} className="inline-flex">
            <input type="hidden" name="restock_amount" value={restockAmount} />
            <input type="hidden" name="restock_scope" value="all" />
            <OperationalSubmitButton
              pendingLabel="Restocking all..."
              confirmMessage={`Add +${restockAmount} stock to every inventory product?`}
              className="inline-flex h-9 items-center rounded-lg border border-emerald-500/40 bg-emerald-900/50 px-3 text-xs font-semibold text-emerald-50 hover:bg-emerald-800/55"
            >
              Restock all +{restockAmount}
            </OperationalSubmitButton>
          </form>
          {selected.size ? (
            <form action={restockAction} className="inline-flex">
              <input type="hidden" name="restock_amount" value={restockAmount} />
              <input type="hidden" name="restock_scope" value="selected" />
              {Array.from(selected).map((id) => (
                <input key={id} type="hidden" name="selected_inventory_row" value={id} />
              ))}
              <OperationalSubmitButton
                pendingLabel="Restocking..."
                confirmMessage={`Add +${restockAmount} stock to ${selected.size} selected product${selected.size === 1 ? "" : "s"}?`}
                className="inline-flex h-9 items-center rounded-lg border border-cyan-500/35 bg-cyan-950/40 px-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-900/45"
              >
                Restock selected ({selected.size}) +{restockAmount}
              </OperationalSubmitButton>
            </form>
          ) : null}
          <span className="ml-auto px-2 text-[11px] text-slate-500">
            One click adds stock across catalog rows.
          </span>
        </div>
      ) : null}

      <div data-inventory-source-report className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="mithron-elevated-card rounded-lg border border-slate-800 bg-[#10151d] p-3">
          <p className="text-xs text-slate-500">Total inventory items</p>
          <p className="mt-1 text-lg font-semibold text-slate-100">{formatNumber(inventoryMetrics?.totalInventoryItems ?? totalProductCount ?? 0)}</p>
        </div>
        <div className="mithron-elevated-card rounded-lg border border-slate-800 bg-[#10151d] p-3">
          <p className="text-xs text-slate-500">In stock</p>
          <p className="mt-1 text-lg font-semibold text-emerald-200">{formatNumber(inventoryMetrics?.inStock ?? 0)}</p>
        </div>
        <div className="mithron-elevated-card rounded-lg border border-slate-800 bg-[#10151d] p-3">
          <p className="text-xs text-slate-500">Low stock</p>
          <p className="mt-1 text-lg font-semibold text-amber-200">{formatNumber(inventoryMetrics?.lowStock ?? 0)}</p>
        </div>
        <div className="mithron-elevated-card rounded-lg border border-slate-800 bg-[#10151d] p-3">
          <p className="text-xs text-slate-500">Out of stock</p>
          <p className="mt-1 text-lg font-semibold text-rose-200">{formatNumber(inventoryMetrics?.outOfStock ?? 0)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Catalog:</span>
        {(["active", "archived", "all"] as const).map((filter) => (
          <Link
            key={filter}
            href={`/admin/inventory?catalog=${filter}`}
            className={`inline-flex h-8 items-center rounded-lg border px-3 font-semibold capitalize ${
              catalogFilter === filter
                ? "border-emerald-400/30 bg-emerald-950/30 text-emerald-100"
                : "border-slate-700 bg-[#151c26] text-slate-300 hover:border-slate-600"
            }`}
          >
            {filter}
          </Link>
        ))}
      </div>

      <div data-inventory-sticky-toolbar className="sticky top-0 z-20 grid gap-2 rounded-xl border border-slate-800 bg-[#10151d]/95 p-2 backdrop-blur-sm md:grid-cols-[minmax(220px,1fr)_160px_160px_auto]">
        <label className="grid gap-1 text-xs font-medium text-slate-500">
          <span className="sr-only">Search</span>
          <span className="flex items-center gap-1 text-slate-400">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            Search
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search product or SKU"
            className="h-10 rounded-lg border border-slate-700 bg-[#0b1017] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-slate-500"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-500">
          Stock status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.currentTarget.value as typeof statusFilter)}
            className="h-10 rounded-lg border border-slate-700 bg-[#0b1017] px-3 text-sm text-slate-100 outline-none focus:border-slate-500"
          >
            <option value="all">All</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-500">
          Stock range
          <select
            value={stockRangeFilter}
            onChange={(event) => setStockRangeFilter(event.currentTarget.value)}
            className="h-10 rounded-lg border border-slate-700 bg-[#0b1017] px-3 text-sm text-slate-100 outline-none focus:border-slate-500"
          >
            <option value="all">All stock</option>
            <option value="zero">Zero</option>
            <option value="low">Low</option>
            <option value="healthy">Healthy</option>
          </select>
        </label>
        {!readOnly ? (
        <button
          type="button"
          onClick={() => setBulkDrawerOpen(true)}
          className="mt-auto inline-flex h-10 items-center justify-center rounded-lg border border-slate-700 bg-[#151c26] px-3 text-xs font-semibold text-slate-100 hover:border-slate-600"
        >
          Bulk actions
        </button>
        ) : null}
      </div>

      {!readOnly ? (
      <div data-inventory-bulk-bar className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#10151d] p-2 text-xs text-slate-400">
        <span className="font-semibold text-slate-300">{selected.size} selected</span>
        <span>Use row checkboxes, then open Bulk actions for a grouped stock update.</span>
      </div>
      ) : null}

      <div className="hidden max-h-[70vh] overflow-auto rounded-xl border border-slate-800 md:block">
        <table data-inventory-table className="platform-table min-w-[1100px] w-full border-collapse bg-[var(--platform-surface)]">
          <thead className="sticky top-0 z-20 bg-[#172131] text-left text-xs font-semibold text-slate-300">
            <tr>
              {!readOnly ? (
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Select visible inventory"
                  checked={visibleRows.length > 0 && visibleRows.every((row) => selected.has(rowKey(row)))}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setSelected((current) => {
                      const next = new Set(current);
                      visibleRows.forEach((row) => {
                        if (checked) next.add(rowKey(row));
                        else next.delete(rowKey(row));
                      });
                      return next;
                    });
                  }}
                  className="h-4 w-4 rounded border-slate-700 bg-[#0b1017]"
                />
              </th>
              ) : null}
              <th className="px-3 py-3">SKU</th>
              <th className="px-3 py-3">Product</th>
              <th className="px-3 py-3">Warehouse</th>
              <th className="px-3 py-3">Qty</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Updated</th>
              {!readOnly ? (
              <th className="sticky right-0 bg-[#172131] px-3 py-3 text-right">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length ? visibleRows.map((row) => (
              <InventoryRow
                key={row.id}
                row={row}
                selected={selected.has(rowKey(row))}
                menuOpen={openMenuId === row.id}
                action={action}
                readOnly={readOnly}
                onSelect={updateSelected}
                onAdjustStock={openAdjustStock}
                onMenuToggle={toggleRowMenu}
                onLocalUpdate={updateRow}
              />
            )) : (
              <tr>
                <td colSpan={readOnly ? 7 : 9} className="px-4 py-10 text-center text-sm text-slate-500">No inventory rows match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div data-inventory-mobile-cards className="grid gap-2 md:hidden">
        {visibleRows.length ? (
          <div className="relative w-full" style={{ height: `${mobileRowVirtualizer.getTotalSize()}px` }}>
            {mobileRowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = visibleRows[virtualRow.index];
              if (!row) return null;

              return (
                <article
                  key={row.id}
                  ref={mobileRowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="content-visibility-auto absolute left-0 top-0 w-full rounded-xl border border-slate-800 bg-[#10151d] p-3 [contain-intrinsic-size:220px] [content-visibility:auto]"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">{row.productName}</p>
                <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{row.sku}</p>
                <p className="mt-1 text-[11px] text-slate-600">{formatUpdated(row.lastUpdated)}</p>
                {row.isArchived ? <p className="mt-1 text-[10px] font-semibold uppercase text-rose-300">Archived</p> : null}
              </div>
              {!readOnly ? (
              <input
                type="checkbox"
                aria-label={`Select ${row.productName}`}
                checked={selected.has(rowKey(row))}
                onChange={(event) => updateSelected(rowKey(row), event.currentTarget.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-[#0b1017]"
              />
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <StatusPill status={row.stockStatus} />
              {!readOnly ? (
              <Link
                href={`/admin/products?product_slug=${encodeURIComponent(row.productSlug)}`}
                data-inventory-quick-edit
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-[#151c26] px-2.5 text-xs font-semibold text-slate-100 hover:border-slate-600"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Edit
              </Link>
              ) : null}
            </div>
            <div className="mt-3">
              {readOnly || !action ? (
                <span className="font-semibold text-slate-100">{formatNumber(row.quantity)}</span>
              ) : (
                <InlineStockEditor row={row} action={action} onLocalUpdate={updateRow} />
              )}
            </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-slate-800 bg-[#10151d] px-4 py-8 text-center text-sm text-slate-500">No inventory rows match the current filters.</p>
        )}
      </div>

      <div data-inventory-pagination className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#10151d] px-3 py-2 text-xs text-slate-400">
        <span>Page {page}</span>
        <div className="flex gap-2">
          {previousPageHref ? (
            <a href={previousPageHref} className="inline-flex h-8 items-center rounded-md border border-slate-700 px-3 font-semibold text-slate-200 hover:bg-[#151c26]">Previous</a>
          ) : (
            <span className="inline-flex h-8 items-center rounded-md border border-slate-800 px-3 font-semibold text-slate-600">Previous</span>
          )}
          {hasNextPage && nextPageHref ? (
            <a href={nextPageHref} className="inline-flex h-8 items-center rounded-md border border-slate-700 px-3 font-semibold text-slate-200 hover:bg-[#151c26]">Next</a>
          ) : (
            <span className="inline-flex h-8 items-center rounded-md border border-slate-800 px-3 font-semibold text-slate-600">Next</span>
          )}
        </div>
      </div>

      {allowCsvImport ? (
      <details data-advanced-warehouse-details className="rounded-lg border border-slate-800 bg-[#10151d] p-3 text-sm text-slate-400">
        <summary className="cursor-pointer font-semibold text-slate-300">Data tools</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <form action={importAction} data-inventory-csv-import className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-[#0b1017] p-2">
            <span className="sr-only">Supabase inventory records are the source of truth.</span>
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-700 bg-[#151c26] px-2.5 text-xs font-semibold text-slate-100 hover:border-slate-600">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Import file
              <input name="inventory_csv" type="file" accept=".csv,text/csv" className="sr-only" />
            </label>
            <OperationalSubmitButton
              pendingLabel="Importing"
              className="inline-flex h-8 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-950/40 px-3 text-xs font-semibold text-emerald-100 hover:bg-emerald-900/45"
            >
              Upload
            </OperationalSubmitButton>
          </form>
          <span data-inventory-audit-table="inventory_movements" className="self-center text-xs text-slate-500">Stock movements are recorded in the audit table.</span>
        </div>
      </details>
      ) : null}

      {adjustingRow && adjustAction ? (
        <InventoryDialogPortal onClose={() => setAdjustingRow(null)}>
          <div
            data-inventory-adjust-dialog
            role="dialog"
            aria-modal="true"
            aria-label={`Adjust stock for ${adjustingRow.productName}`}
            className="w-full max-w-2xl scale-100 rounded-xl border border-slate-800 bg-[#0f141b] p-4 shadow-2xl shadow-black/40 transition duration-150 ease-out"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Adjust stock</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-100">{adjustingRow.productName}</h3>
                <p className="mt-1 text-xs text-slate-500">{adjustingRow.sku} · {adjustingRow.warehouseCode || "No warehouse"}</p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustingRow(null)}
                aria-label="Close stock adjustment"
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:bg-[#151c26]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 grid gap-3 rounded-xl border border-slate-800 bg-[#0b1017] p-3 text-xs text-slate-500">
              <p className="flex items-center justify-between gap-3 sm:block"><span>Current stock</span><strong className="text-slate-100">{formatNumber(adjustingRow.quantity)}</strong></p>
            </div>
            <form
              action={adjustAction}
              data-inventory-adjust-form
              onSubmit={(event) => applyAdjustStock(event.currentTarget)}
              className="mt-4 grid gap-4"
            >
              <input type="hidden" name="product_slug" value={adjustingRow.productSlug} />
              <input type="hidden" name="sku" value={adjustingRow.sku} />
              <input type="hidden" name="variant_id" value={adjustingRow.variantId ?? ""} />
              <input type="hidden" name="warehouse_code" value={adjustingRow.warehouseCode} />
              <input type="hidden" name="category" value={adjustingRow.category} />
              <input type="hidden" name="price" value={adjustingRow.price} />
              <input type="hidden" name="stock_status" value={adjustingRow.stockStatus} />
              {adjustingRow.warehouseUpdatedAt ? <input type="hidden" name="expected_updated_at" value={adjustingRow.warehouseUpdatedAt} /> : null}
              {adjustingRow.inventoryUpdatedAt ? <input type="hidden" name="expected_inventory_updated_at" value={adjustingRow.inventoryUpdatedAt} /> : null}
              <fieldset className="grid gap-2">
                <legend className="text-xs font-medium text-slate-500">Adjustment mode</legend>
                <div className="flex flex-wrap gap-2">
                  {(["increase", "decrease", "replace"] as const).map((mode) => (
                    <label key={mode} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0b1017] px-3 py-2 text-xs font-semibold text-slate-300">
                      <input
                        type="radio"
                        name="adjustment_mode"
                        value={mode}
                        checked={adjustmentMode === mode}
                        onChange={() => setAdjustmentMode(mode)}
                        className="h-3.5 w-3.5 border-slate-700 bg-[#0b1017]"
                      />
                      {mode === "increase" ? "Increase" : mode === "decrease" ? "Decrease" : "Replace"}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="grid gap-1 text-xs font-medium text-slate-500">
                Quantity
                <input
                  name="adjustment_quantity"
                  type="number"
                  min={0}
                  required
                  defaultValue={adjustmentMode === "replace" ? adjustingRow.quantity : 0}
                  key={`${adjustingRow.id}:${adjustmentMode}`}
                  className="h-10 rounded-lg border border-slate-700 bg-[#0b1017] px-3 text-sm text-slate-100 outline-none focus:border-emerald-400/70"
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-500">
                Reason
                <select name="reason_code" required defaultValue="adjustment" className="h-10 rounded-lg border border-slate-700 bg-[#0b1017] px-3 text-sm text-slate-100 outline-none focus:border-emerald-400/70">
                  {adjustmentReasonOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-500">
                Internal notes
                <textarea
                  name="note"
                  rows={3}
                  placeholder="Optional notes for the audit trail"
                  className="rounded-lg border border-slate-700 bg-[#0b1017] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-400/70"
                />
              </label>
              <input type="hidden" name="change_summary" value={`Adjust stock ${adjustingRow.productSlug}:${adjustingRow.sku}`} />
              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <button type="button" onClick={() => setAdjustingRow(null)} className="h-9 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:bg-[#151c26]">Cancel</button>
                <OperationalSubmitButton
                  pendingLabel="Saving"
                  className="inline-flex h-9 items-center rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-4 text-xs font-semibold text-emerald-100 hover:bg-emerald-900/45"
                >
                  Apply adjustment
                </OperationalSubmitButton>
              </div>
            </form>
          </div>
        </InventoryDialogPortal>
      ) : null}

      {bulkDrawerOpen ? (
        <InventoryDialogPortal onClose={() => setBulkDrawerOpen(false)} align="right">
          <form
            action={bulkAction}
            data-inventory-bulk-drawer
            role="dialog"
            aria-modal="true"
            aria-label="Bulk stock update"
            className="grid h-full w-full max-w-sm content-start gap-4 rounded-l-xl border-l border-slate-800 bg-[#0f141b] p-4 shadow-2xl shadow-black/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Bulk stock</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-100">{selected.size} selected</h3>
              </div>
              <button type="button" onClick={() => setBulkDrawerOpen(false)} aria-label="Close bulk stock update" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:bg-[#151c26]">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {Array.from(selected).map((id) => (
              <input key={id} type="hidden" name="selected_inventory_row" value={id} />
            ))}
            <label className="grid gap-1 text-xs font-medium text-slate-500">
              Status
              <select name="bulk_stock_status" defaultValue="available" className="h-10 rounded-lg border border-slate-700 bg-[#0b1017] px-3 text-sm text-slate-100">
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <OperationalSubmitButton
              pendingLabel="Updating"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-4 text-sm font-semibold text-emerald-100 hover:bg-emerald-900/45"
            >
              Apply update
            </OperationalSubmitButton>
          </form>
        </InventoryDialogPortal>
      ) : null}
    </section>
  );
}
