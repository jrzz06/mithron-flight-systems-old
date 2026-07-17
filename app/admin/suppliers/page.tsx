import Link from "next/link";
import { AdminSuppliersDirectory } from "@/components/admin/admin-suppliers-directory";
import { AdminSuppliersDirectoryLiveSync } from "@/components/admin/admin-suppliers-directory-live-sync";
import { connectivityMessage } from "@/lib/platform/copy";
import { getAdminSuppliersSnapshot } from "@/services/admin";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AdminSuppliersPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const [access, policy] = await Promise.all([
    getAdminSuppliersSnapshot(),
    getAdminSettingsPolicy()
  ]);
  const params = searchParams ? await searchParams : {};
  const query = searchValue(params, "q").toLowerCase();

  const suppliers = access.data.suppliers.filter((supplier) => {
    if (!query) return true;
    const haystack = `${supplier.name} ${supplier.company} ${supplier.email} ${supplier.phone}`.toLowerCase();
    return haystack.includes(query);
  });

  return (
    <div className="grid gap-4" data-supplier-directory>
      <AdminSuppliersDirectoryLiveSync enabled={policy.realtimeUpdatesEnabled} />

      {access.blockedReason ? (
        <p className="text-sm text-[var(--platform-warning)]">{connectivityMessage(access.blockedReason)}</p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex flex-1 flex-wrap items-end gap-2">
          <label className="grid min-w-[220px] flex-1 gap-1 text-sm">
            <span className="text-[var(--platform-text-muted)]">Search suppliers</span>
            <input
              name="q"
              defaultValue={query}
              placeholder="Company, email, or contact name"
              className="h-9 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 text-sm"
            />
          </label>
          <button type="submit" className="platform-btn-primary h-9 rounded-[8px] px-4 text-sm font-medium">Search</button>
        </form>
        <Link href="/admin/suppliers/products" className="platform-btn-primary h-9 rounded-[8px] px-4 text-sm font-medium">
          Review submissions
        </Link>
      </div>

      <AdminSuppliersDirectory suppliers={suppliers} />
    </div>
  );
}
