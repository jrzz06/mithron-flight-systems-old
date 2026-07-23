"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { useOptionalAdminRealtime } from "@/components/admin/realtime/admin-realtime-provider";
import {
  approveSupplierFormAction,
  suspendSupplierFormAction,
  supplierActionIdleState,
  type SupplierActionState
} from "@/app/admin/suppliers/actions";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { StatusPill } from "@/components/platform";
import { wrapServerAction } from "@/hooks/use-async-action";
import { notify } from "@/lib/feedback/notify";
import { markControlPlaneLiveSyncFlush } from "@/lib/control-plane/shared-live-sync-coordinator";
import type { AdminSupplierItem } from "@/services/admin";

type OptimisticSupplierUpdate = {
  supplierId: string;
  verificationStatus: string;
};

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function AdminSuppliersDirectory({ suppliers }: { suppliers: AdminSupplierItem[] }) {
  const realtime = useOptionalAdminRealtime();
  const [, startTransition] = useTransition();
  const [optimisticSuppliers, applyOptimistic] = useOptimistic(
    suppliers,
    (state, update: OptimisticSupplierUpdate) =>
      state.map((supplier) =>
        supplier.id === update.supplierId
          ? { ...supplier, verificationStatus: update.verificationStatus }
          : supplier
      )
  );

  async function runSupplierAction(
    action: (prev: SupplierActionState, formData: FormData) => Promise<SupplierActionState>,
    formData: FormData,
    optimisticStatus: string
  ) {
    const supplierId = String(formData.get("supplier_id") ?? "").trim();
    startTransition(() => {
      applyOptimistic({ supplierId, verificationStatus: optimisticStatus });
    });

    const result = await wrapServerAction(action, { label: "Update supplier" })(
      supplierActionIdleState,
      formData
    );
    if (result.status === "success") {
      notify.success(result.message, { source: "admin-suppliers" });
      markControlPlaneLiveSyncFlush();
      void realtime?.reconcileResources(["suppliers"]);
      return;
    }
    notify.error(result.message, { source: "admin-suppliers" });
    void realtime?.reconcileResources(["suppliers"]);
  }

  return (
    <div className="overflow-x-auto rounded-[8px] border border-[var(--platform-border)]">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 z-10 border-b border-[var(--platform-border)] bg-[var(--platform-surface-muted)] text-left type-meta uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">Company</th>
            <th className="px-3 py-2 font-medium">Contact</th>
            <th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium">Phone</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Registered</th>
            <th className="px-3 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {optimisticSuppliers.length ? optimisticSuppliers.map((supplier) => (
            <tr key={supplier.id} data-supplier-id={supplier.id} className="border-b border-[var(--platform-border)] last:border-b-0">
              <td className="px-3 py-2.5 font-medium text-[var(--platform-text-primary)]">{supplier.company || supplier.name}</td>
              <td className="px-3 py-2.5 text-[var(--platform-text-secondary)]">{supplier.name || "—"}</td>
              <td className="px-3 py-2.5 text-[var(--platform-text-secondary)]">{supplier.email || "—"}</td>
              <td className="px-3 py-2.5 text-[var(--platform-text-secondary)]">{supplier.phone || "—"}</td>
              <td className="px-3 py-2.5"><StatusPill status={supplier.verificationStatus} /></td>
              <td className="px-3 py-2.5 text-xs text-[var(--platform-text-muted)]">{formatDate(supplier.registeredAt)}</td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/suppliers/products?supplier=${encodeURIComponent(supplier.id)}`}
                    className="text-xs font-medium text-[var(--platform-accent)]"
                  >
                    Products
                  </Link>
                  {supplier.verificationStatus !== "verified" ? (
                    <form
                      action={(formData) => runSupplierAction(approveSupplierFormAction, formData, "verified")}
                    >
                      <input type="hidden" name="supplier_id" value={supplier.id} />
                      <input type="hidden" name="verification_status" value={supplier.verificationStatus} />
                      <OperationalSubmitButton pendingLabel="Approving" className="platform-btn-primary h-8 rounded-[8px] px-3 text-xs font-medium">
                        Approve
                      </OperationalSubmitButton>
                    </form>
                  ) : null}
                  {supplier.verificationStatus !== "disabled" ? (
                    <form
                      action={(formData) => runSupplierAction(suspendSupplierFormAction, formData, "disabled")}
                    >
                      <input type="hidden" name="supplier_id" value={supplier.id} />
                      <OperationalSubmitButton pendingLabel="Suspending" className="platform-btn-danger h-8 rounded-[8px] px-3 text-xs font-medium">
                        Suspend
                      </OperationalSubmitButton>
                    </form>
                  ) : null}
                </div>
              </td>
            </tr>
          )) : (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-sm text-[var(--platform-text-muted)]">
                No supplier accounts match this search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
