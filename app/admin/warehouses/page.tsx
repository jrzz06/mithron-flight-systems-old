import { ControlShell } from "@/components/admin/control-shell";
import { OperationalFeedback } from "@/components/admin/module-panel";
import { CreateWarehouseForm, WarehouseDirectory } from "@/components/admin/warehouse-management-panel";
import { AdminWarehousesLiveSync } from "@/components/admin/admin-warehouses-live-sync";
import { createWarehouseFormAction } from "@/app/admin/warehouses/actions";
import { listAdminWarehouses } from "@/services/warehouses";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";

export const dynamic = "force-dynamic";

export default async function AdminWarehousesPage() {
  const [warehouses, policy] = await Promise.all([
    listAdminWarehouses(process.env, { activeOnly: true }),
    getAdminSettingsPolicy()
  ]);

  return (
    <div data-warehouse-management-shell className="grid gap-4">
      <AdminWarehousesLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <ControlShell
        eyebrow="Fulfillment"
        title="Warehouses"
        description="Physical warehouse sites stored in the database. Operators are assigned to exactly one site."
        actions={[{ label: "Users", href: "/admin/users" }]}
      >
        <OperationalFeedback
          idle="Warehouse creation and assignment results appear here."
        />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <WarehouseDirectory warehouses={warehouses} />
          <CreateWarehouseForm action={createWarehouseFormAction} />
        </div>
      </ControlShell>
    </div>
  );
}
