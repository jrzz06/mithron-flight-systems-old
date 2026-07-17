"use client";

import { useMemo } from "react";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { useAdminLiveCollectionRows } from "@/components/admin/realtime/use-admin-live-collection-rows";
import { wrapServerAction } from "@/hooks/use-async-action";
import type { WarehouseOption } from "@/services/warehouses";
import type { AdminEntityRow } from "@/lib/admin/realtime/admin-entity-store";

type CreateWarehouseFormProps = {
  action: (formData: FormData) => void | Promise<void>;
};

export function CreateWarehouseForm({ action }: CreateWarehouseFormProps) {
  const timedAction = useMemo(
    () => wrapServerAction(action, { label: "Create warehouse" }),
    [action]
  );

  return (
    <form action={timedAction} data-warehouse-create-form className="grid gap-3 rounded-xl border border-slate-800 bg-[#0f141b] p-4">
      <div>
        <p className="text-sm font-semibold text-slate-100">Create warehouse site</p>
        <p className="mt-1 text-xs text-slate-500">Every warehouse must exist in the database before operators can be assigned.</p>
      </div>
      <input
        name="warehouse_name"
        required
        minLength={3}
        placeholder="Mumbai Fulfillment Center"
        className="h-10 rounded-lg border border-slate-700 bg-[#10151d] px-3 text-sm text-slate-100 outline-none"
      />
      <input
        name="warehouse_location"
        placeholder="City, region, or country"
        className="h-10 rounded-lg border border-slate-700 bg-[#10151d] px-3 text-sm text-slate-100 outline-none"
      />
      <OperationalSubmitButton pendingLabel="Creating" className="inline-flex h-9 items-center rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-3 text-sm font-semibold text-emerald-200">
        Create warehouse
      </OperationalSubmitButton>
    </form>
  );
}

type WarehouseDirectoryProps = {
  warehouses: WarehouseOption[];
};

export function WarehouseDirectory({ warehouses }: WarehouseDirectoryProps) {
  const liveWarehouses = useAdminLiveCollectionRows(
    "warehouses",
    "warehouses",
    warehouses as unknown as AdminEntityRow[],
    ["id", "code"]
  ) as unknown as WarehouseOption[];

  return (
    <section data-warehouse-directory className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Warehouse sites</p>
          <h2 className="mt-1 text-base font-semibold text-slate-100">{liveWarehouses.length} active site{liveWarehouses.length === 1 ? "" : "s"}</h2>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {liveWarehouses.length ? liveWarehouses.map((warehouse) => (
          <article
            key={warehouse.code}
            data-warehouse-card
            data-warehouse-code={warehouse.code}
            className="rounded-xl border border-slate-800 bg-[#0f141b] p-4"
          >
            <p className="text-sm font-semibold text-slate-100">{warehouse.name}</p>
            <p className="mt-1 text-xs text-slate-500">{warehouse.code}</p>
            <p className="mt-2 text-sm text-slate-400">{warehouse.location || "Location not set"}</p>
            <p className="mt-3 text-xs text-slate-500">{warehouse.operatorCount} operator{warehouse.operatorCount === 1 ? "" : "s"} assigned</p>
          </article>
        )) : (
          <p className="rounded-xl border border-slate-800 bg-[#0f141b] p-4 text-sm text-slate-500">
            No warehouse sites exist yet. Create the first warehouse before assigning operators.
          </p>
        )}
      </div>
    </section>
  );
}
