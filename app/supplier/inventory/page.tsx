import Link from "next/link";
import { AdminSection, OperationalFeedback } from "@/components/admin/module-panel";
import { StatusPill } from "@/components/platform";
import { SupplierLiveSync } from "@/components/supplier/supplier-live-sync";
import { relativeTimeLabel, supplierEmptyMessage } from "@/lib/platform/copy";
import { getCurrentAuthContext } from "@/services/auth";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { listSupplierInventory, listSupplierProducts } from "@/services/supplier-actions";

type SearchParams = Record<string, string | string[] | undefined>;

function value(params: SearchParams, key: string) {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
}

function needsStockAttention(stockStatus: string) {
  return stockStatus === "low_stock" || stockStatus === "out_of_stock";
}

export default async function SupplierInventoryPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const [context, policy, params] = await Promise.all([
    getCurrentAuthContext(),
    getAdminSettingsPolicy(),
    searchParams ? searchParams : Promise.resolve({} as SearchParams)
  ]);
  const products = context.userId ? await listSupplierProducts(context.userId) : [];
  const inventory = context.userId
    ? await listSupplierInventory(context.userId, process.env, products)
    : [];

  return (
    <div data-supplier-inventory-route className="grid gap-5">
      <SupplierLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <p className="text-sm leading-relaxed text-[var(--platform-text-secondary)]">
        View current warehouse stock for your products. Stock levels are managed by our team and mirror the admin
        inventory records exactly.
      </p>

      <OperationalFeedback
        status={value(params, "operation_status")}
        message={value(params, "operation_message")}
        context="Stock"
      />

      <AdminSection title="Stock levels" description="Read-only view of admin inventory for your products.">
        <div className="overflow-hidden rounded-xl border border-[var(--platform-border)]">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[36%]" />
              <col className="w-[18%]" />
              <col className="w-[12%]" />
              <col className="w-[16%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead className="bg-[var(--platform-surface-muted)] text-left text-[var(--platform-text-muted)]">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {inventory.length ? inventory.map((row) => {
                const slug = String(row.product_slug ?? "");
                const stockStatus = String(row.stock_status ?? "available");
                const productName = String(row.product_name ?? slug);
                const updatedAt = typeof row.updated_at === "string" ? relativeTimeLabel(row.updated_at) : "—";
                const attention = needsStockAttention(stockStatus);
                return (
                  <tr
                    key={String(row.id)}
                    className={`border-t border-[var(--platform-border)] ${attention ? "bg-amber-950/10" : ""}`}
                  >
                    <td className="px-4 py-3 text-[var(--platform-text-primary)]">
                      <Link href={`/supplier/products/${encodeURIComponent(slug)}/edit`} className="block truncate font-medium hover:text-[var(--platform-accent)]">
                        {productName}
                      </Link>
                    </td>
                    <td className="truncate px-4 py-3 text-[var(--platform-text-secondary)]">{String(row.sku ?? "—")}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--platform-text-secondary)]">{String(row.quantity ?? 0)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={stockStatus} />
                    </td>
                    <td className="px-4 py-3 text-[var(--platform-text-muted)]">{updatedAt}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--platform-text-muted)]">
                    {supplierEmptyMessage("inventory")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminSection>
    </div>
  );
}
