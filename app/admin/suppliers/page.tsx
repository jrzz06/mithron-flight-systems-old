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
  const params = searchParams ? await searchParams : {};
  const query = searchValue(params, "q").toLowerCase();
  const pageRaw = Number(searchValue(params, "page") || "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSize = 80;

  const [access, policy] = await Promise.all([
    getAdminSuppliersSnapshot({
      q: query || undefined,
      limit: pageSize,
      offset: (page - 1) * pageSize
    }),
    getAdminSettingsPolicy()
  ]);

  const suppliers = access.data.suppliers;

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
