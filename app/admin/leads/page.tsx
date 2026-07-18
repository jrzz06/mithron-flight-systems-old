import Link from "next/link";
import { deleteLeadFormAction, pushLeadToOrderFormAction } from "@/app/admin/leads/actions";
import { AdminLeadQueue } from "@/components/admin/admin-lead-queue";
import { listAdminLeads } from "@/services/leads";
import { loadLinkedOrderSummaries } from "@/lib/admin/linked-orders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SearchParams = Record<string, string | string[] | undefined>;

const statusTabs = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "converted", label: "Converted" }
] as const;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AdminLeadsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const statusFilter = searchValue(params, "status") || "all";
  const query = searchValue(params, "q");
  const pageRaw = Number(searchValue(params, "page") || "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSize = 50;

  const leads = await listAdminLeads({
    status: statusFilter,
    q: query || undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize
  });

  const linkedOrderIds = leads
    .map((lead) => String(lead.converted_order_id ?? "").trim())
    .filter(Boolean);
  const linkedOrders = await loadLinkedOrderSummaries(linkedOrderIds);

  return (
    <div className="grid gap-4" data-admin-leads-page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
            Fulfillment
          </p>
          <h1 className="text-xl font-semibold text-[var(--platform-text-primary)]">Leads</h1>
          <p className="mt-1 text-sm text-[var(--platform-text-secondary)]">
            Contact, product, and checkout enquiries in one queue. Push to order or delete.
          </p>
        </div>
      </div>

      <nav className="flex flex-nowrap gap-2 overflow-x-auto" aria-label="Lead status filters">
        {statusTabs.map((tab) => {
          const active = statusFilter === tab.key;
          const href = new URLSearchParams();
          if (tab.key !== "all") href.set("status", tab.key);
          if (query) href.set("q", query);
          return (
            <Link
              key={tab.key}
              href={`/admin/leads${href.toString() ? `?${href.toString()}` : ""}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                active
                  ? "border-[var(--platform-accent)] bg-[var(--platform-accent)]/10 text-[var(--platform-accent)]"
                  : "border-[var(--platform-border)] text-[var(--platform-text-secondary)]"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <form className="flex flex-wrap gap-2" method="get">
        {statusFilter !== "all" ? <input type="hidden" name="status" value={statusFilter} /> : null}
        <input
          name="q"
          defaultValue={query}
          placeholder="Search name, email, phone, product…"
          className="h-9 min-w-[240px] flex-1 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 text-sm"
        />
        <button type="submit" className="platform-btn-primary h-9 rounded-[8px] px-3 text-xs font-medium">
          Search
        </button>
      </form>

      <AdminLeadQueue
        leads={leads}
        linkedOrders={linkedOrders}
        listStatus={statusFilter}
        listQuery={query}
        actions={{
          pushToOrder: pushLeadToOrderFormAction,
          deleteLead: deleteLeadFormAction
        }}
      />

      <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)]">
        <span>Page {page}</span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={`/admin/leads?${new URLSearchParams({
                ...(statusFilter !== "all" ? { status: statusFilter } : {}),
                ...(query ? { q: query } : {}),
                page: String(page - 1)
              }).toString()}`}
              className="underline"
            >
              Previous
            </Link>
          ) : null}
          {leads.length >= pageSize ? (
            <Link
              href={`/admin/leads?${new URLSearchParams({
                ...(statusFilter !== "all" ? { status: statusFilter } : {}),
                ...(query ? { q: query } : {}),
                page: String(page + 1)
              }).toString()}`}
              className="underline"
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
