import { AdminInventoryLiveSync } from "@/components/admin/admin-inventory-live-sync";
import { InventoryActionBridge } from "@/components/admin/inventory-action-bridge";
import {
  bulkAdminInventoryAction,
  importAdminInventoryAction,
  restockAllAdminInventoryAction,
  saveAdminInventoryAction,
  saveInventoryAdjustmentAction
} from "@/app/admin/inventory/actions";
import { CSV_INVENTORY_PAGE_SIZE, getCsvInventoryRows, type CatalogFilter } from "@/services/csv-inventory-source";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";

export const dynamic = "force-dynamic";

/** Bound bulk restock / import so Vercel kills the request instead of leaving buttons pending forever. */
export const maxDuration = 60;

type SearchParams = Record<string, string | string[] | undefined>;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readCatalogFilter(value: string): CatalogFilter {
  if (value === "archived" || value === "all" || value === "active") return value;
  return "all";
}

export default async function AdminInventoryPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const currentPage = Math.max(1, Number.parseInt(searchValue(params, "page"), 10) || 1);
  const catalogFilter = readCatalogFilter(searchValue(params, "catalog"));
  const initialProductSlug = searchValue(params, "product") || searchValue(params, "product_slug");
  const [policy, inventorySource] = await Promise.all([
    getAdminSettingsPolicy(),
    getCsvInventoryRows({ page: currentPage, pageSize: CSV_INVENTORY_PAGE_SIZE, catalogFilter })
  ]);
  const rows = inventorySource.rows;
  const previousPageHref = currentPage > 1 ? `/admin/inventory?page=${currentPage - 1}&catalog=${catalogFilter}` : undefined;
  const nextPageHref = inventorySource.hasNextPage ? `/admin/inventory?page=${currentPage + 1}&catalog=${catalogFilter}` : undefined;

  return (
    <div data-admin-inventory-route className="grid gap-4">
      <AdminInventoryLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <InventoryActionBridge
        rows={rows}
        saveAction={saveAdminInventoryAction}
        adjustAction={saveInventoryAdjustmentAction}
        importAction={importAdminInventoryAction}
        bulkAction={bulkAdminInventoryAction}
        restockAction={restockAllAdminInventoryAction}
        exportHref={`/admin/inventory/export?catalog=${catalogFilter}`}
        title="Inventory"
        page={inventorySource.page}
        totalProductCount={inventorySource.totalProductCount}
        inventoryMetrics={inventorySource.inventoryMetrics}
        catalogFilter={catalogFilter}
        hasNextPage={inventorySource.hasNextPage}
        previousPageHref={previousPageHref}
        nextPageHref={nextPageHref}
        initialSearchQuery={initialProductSlug}
      />
    </div>
  );
}
