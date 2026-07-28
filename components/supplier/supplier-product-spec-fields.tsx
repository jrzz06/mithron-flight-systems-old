"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export type SupplierSpecEntry = {
  id: string;
  key: string;
  value: string;
};

const DEFAULT_SPEC_SUGGESTIONS = [
  { key: "Battery Capacity", placeholder: "e.g. 30,000 mAh" },
  { key: "Flight Time", placeholder: "e.g. 45 mins" },
  { key: "Payload Capacity", placeholder: "e.g. 10 kg / 16 L" },
  { key: "Operating Range", placeholder: "e.g. 5 km" },
  { key: "Spray Width", placeholder: "e.g. 4 - 6 meters" },
  { key: "IP Rating", placeholder: "e.g. IP67" }
];

function buildInitialRows(specs?: Record<string, string> | null): SupplierSpecEntry[] {
  if (!specs || !Object.keys(specs).length) {
    return DEFAULT_SPEC_SUGGESTIONS.slice(0, 4).map((item, index) => ({
      id: `spec-init-${index}`,
      key: item.key,
      value: ""
    }));
  }

  const entries = Object.entries(specs).map(([key, value], index) => ({
    id: `spec-${index}-${Date.now()}`,
    key,
    value: String(value ?? "")
  }));

  // Ensure at least 3 rows are visible
  while (entries.length < 3) {
    entries.push({
      id: `spec-pad-${entries.length}`,
      key: "",
      value: ""
    });
  }

  return entries;
}

export function SupplierProductSpecFields({ specs }: { specs?: Record<string, string> | null }) {
  const [rows, setRows] = useState<SupplierSpecEntry[]>(() => buildInitialRows(specs));

  function addRow() {
    setRows((current) => [
      ...current,
      { id: `spec-row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, key: "", value: "" }
    ]);
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  function updateRow(id: string, field: "key" | "value", newValue: string) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: newValue } : row))
    );
  }

  return (
    <div
      data-supplier-product-spec-fields
      className="grid gap-3 rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)]/60 p-4"
    >
      <input type="hidden" name="specs_editor_present" value="1" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-0.5 text-sm">
          <span className="font-medium text-[var(--platform-text-primary)]">Key specifications</span>
          <span className="text-xs text-[var(--platform-text-muted)]">
            Technical attributes displayed on the product page (e.g. Battery, Flight Time, Payload).
          </span>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--platform-text-primary)] transition hover:bg-[var(--platform-accent-soft)]"
        >
          <Plus className="size-3.5" />
          Add spec
        </button>
      </div>

      <div className="grid gap-2.5">
        {rows.map((row, index) => (
          <div key={row.id} className="flex items-center gap-2">
            <input
              name="spec_key"
              value={row.key}
              onChange={(e) => updateRow(row.id, "key", e.target.value)}
              placeholder="Specification name (e.g. Battery)"
              className="flex-1 rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-sm text-[var(--platform-text-primary)] placeholder:text-[var(--platform-text-muted)]"
            />
            <input
              name="spec_value"
              value={row.value}
              onChange={(e) => updateRow(row.id, "value", e.target.value)}
              placeholder="Value (e.g. 30,000 mAh)"
              className="flex-1 rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-sm text-[var(--platform-text-primary)] placeholder:text-[var(--platform-text-muted)]"
            />
            <button
              type="button"
              aria-label="Remove spec"
              onClick={() => removeRow(row.id)}
              disabled={rows.length <= 1}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--platform-border)] text-[var(--platform-text-secondary)] transition hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
