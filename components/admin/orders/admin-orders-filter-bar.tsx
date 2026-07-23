"use client";

import { useEffect, useMemo, useState } from "react";
import { Input, Select } from "@/components/platform";
import type { OrderFilterState, OrderSortKey } from "@/components/admin/orders/order-view-helpers";
import { orderRadiusCard, orderRadiusControl } from "@/components/admin/orders/order-layout-utils";
import {
  FULFILLMENT_FILTER_STATUSES,
  PAYMENT_STATUSES,
  fulfillmentStatusLabel,
  paymentStatusLabel
} from "@/lib/orders/status";

type AdminOrdersFilterBarProps = {
  filters: OrderFilterState;
  warehouses: Array<{ code: string; name: string }>;
  onChange: (patch: Partial<OrderFilterState>) => void;
};

const sortOptions: Array<{ value: OrderSortKey; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "total_desc", label: "Highest total" },
  { value: "customer_asc", label: "Customer A–Z" },
  { value: "needs_action", label: "Needs action first" }
];

const paymentOptions = ["", ...PAYMENT_STATUSES];
const fulfillmentOptions = ["", ...FULFILLMENT_FILTER_STATUSES];

export function AdminOrdersFilterBar({ filters, warehouses, onChange }: AdminOrdersFilterBarProps) {
  const [localQuery, setLocalQuery] = useState(filters.query);
  const [syncedQuery, setSyncedQuery] = useState(filters.query);
  const [filtersOpen, setFiltersOpen] = useState(false);

  if (filters.query !== syncedQuery) {
    setSyncedQuery(filters.query);
    setLocalQuery(filters.query);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (localQuery !== filters.query) onChange({ query: localQuery });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [localQuery, filters.query, onChange]);

  const activeFilterCount = useMemo(() => {
    return [
      filters.paymentStatus,
      filters.fulfillmentStatus,
      filters.warehouse,
      filters.dateFrom,
      filters.dateTo,
      filters.customer,
      filters.product,
      filters.orderId
    ].filter(Boolean).length;
  }, [filters]);

  return (
    <div data-order-filter-form className="grid min-w-0 gap-2">
      <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <Input
            id="admin-order-search"
            value={localQuery}
            onChange={(event) => setLocalQuery(event.target.value)}
            placeholder="Search order, email, phone, product…"
            aria-label="Search orders"
          />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          className={`inline-flex h-10 shrink-0 items-center gap-1.5 border px-3 text-sm font-medium transition ${orderRadiusControl} ${
            filtersOpen || activeFilterCount
              ? "border-violet-500/40 bg-violet-500/10 text-violet-100"
              : "border-[var(--platform-border)] bg-[var(--platform-surface-muted)] text-[var(--platform-text-secondary)] hover:border-[var(--platform-border-strong)]"
          }`}
          aria-expanded={filtersOpen}
          aria-controls="admin-order-filters-panel"
        >
          Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
          <span className={`type-badge opacity-70 transition ${filtersOpen ? "rotate-180" : ""}`}>▾</span>
        </button>
        <div className="w-full shrink-0 md:w-48">
          <Select
            value={filters.sort}
            onChange={(event) => onChange({ sort: event.target.value as OrderSortKey })}
            aria-label="Sort orders"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {filtersOpen ? (
        <div
          id="admin-order-filters-panel"
          className={`grid gap-2 border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]/60 p-3 sm:grid-cols-2 lg:grid-cols-4 ${orderRadiusCard}`}
        >
          <Select
            value={filters.paymentStatus}
            onChange={(event) => onChange({ paymentStatus: event.target.value })}
            aria-label="Payment status filter"
          >
            <option value="">All payment statuses</option>
            {paymentOptions.filter(Boolean).map((status) => (
              <option key={status} value={status}>
                {paymentStatusLabel(status)}
              </option>
            ))}
          </Select>
          <Select
            value={filters.fulfillmentStatus}
            onChange={(event) => onChange({ fulfillmentStatus: event.target.value })}
            aria-label="Fulfillment status filter"
          >
            <option value="">All fulfillment statuses</option>
            {fulfillmentOptions.filter(Boolean).map((status) => (
              <option key={status} value={status}>
                {fulfillmentStatusLabel(status)}
              </option>
            ))}
          </Select>
          <Select
            value={filters.warehouse}
            onChange={(event) => onChange({ warehouse: event.target.value })}
            aria-label="Warehouse filter"
          >
            <option value="">All warehouses</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.code} value={warehouse.code}>
                {warehouse.name}
              </option>
            ))}
          </Select>
          <Input
            value={filters.customer}
            onChange={(event) => onChange({ customer: event.target.value })}
            placeholder="Customer email"
            aria-label="Customer filter"
          />
          <Input
            value={filters.product}
            onChange={(event) => onChange({ product: event.target.value })}
            placeholder="Product slug or name"
            aria-label="Product filter"
          />
          <Input
            value={filters.orderId}
            onChange={(event) => onChange({ orderId: event.target.value })}
            placeholder="Order ID filter"
            aria-label="Order ID filter"
          />
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => onChange({ dateFrom: event.target.value })}
            aria-label="Date from"
          />
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(event) => onChange({ dateTo: event.target.value })}
            aria-label="Date to"
          />
        </div>
      ) : null}
    </div>
  );
}
