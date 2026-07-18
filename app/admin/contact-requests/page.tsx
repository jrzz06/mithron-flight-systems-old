import Link from "next/link";
import {
  markContactRequestContactedFormAction,
  markContactRequestInProgressFormAction,
  promoteContactRequestToOrderFormAction,
  rejectContactRequestFormAction,
  requestContactRequestMissingInfoFormAction,
  updateContactRequestAddressClientAction,
  updateContactRequestContactDetailsFormAction
} from "@/app/admin/contact-requests/actions";
import { assignLinkedOrderToWarehouseFormAction } from "@/app/admin/contact-requests/warehouse-actions";
import { AdminContactRequestQueue } from "@/components/admin/admin-contact-request-queue";
import { EnquiryQueueLiveSync } from "@/components/admin/enquiry-queue-live-sync";
import { loadLinkedOrderSummaries } from "@/lib/admin/linked-orders";
import { listAdminContactRequests, contactRequestMatchesLeadStatusFilter } from "@/services/contact-requests";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";

export const dynamic = "force-dynamic";
/** Bound contact-request mutations so a slow Supabase call cannot leave save buttons pending forever. */
export const maxDuration = 60;

type SearchParams = Record<string, string | string[] | undefined>;

const statusTabs = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "converted", label: "Converted" },
  { key: "closed", label: "Closed" }
] as const;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export default async function AdminContactRequestsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const statusFilter = searchValue(params, "status") || "all";
  const query = searchValue(params, "q").toLowerCase();
  const focusRequestId = searchValue(params, "open") || searchValue(params, "contact_request_id");
  const addressFields = searchValue(params, "address_fields")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
  const pageRaw = Number(searchValue(params, "page") || "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSize = 50;

  const [requests, policy] = await Promise.all([
    listAdminContactRequests({
      status: statusFilter,
      q: query || undefined,
      limit: pageSize,
      offset: (page - 1) * pageSize
    }),
    getAdminSettingsPolicy()
  ]);

  // Server already filtered; keep helper as a safety net for lead-status aliases.
  const filtered = requests.filter((request) =>
    contactRequestMatchesLeadStatusFilter(request.status, statusFilter)
  );

  const linkedOrderIds = filtered
    .map((request) => String(request.converted_order_id ?? "").trim())
    .filter(Boolean);
  const linkedOrders = await loadLinkedOrderSummaries(linkedOrderIds);

  return (
    <div className="grid gap-4" data-admin-contact-requests-page>
      <EnquiryQueueLiveSync enabled={policy.realtimeUpdatesEnabled} />

      <nav className="flex flex-nowrap gap-2 overflow-x-auto" aria-label="Contact request status filters">
        {statusTabs.map((tab) => {
          const active = statusFilter === tab.key;
          const href = `/admin/contact-requests?status=${tab.key}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
          return (
            <Link
              key={tab.key}
              href={href}
              className={`rounded-[8px] border px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "border-[var(--platform-accent)]/40 bg-[var(--platform-accent-soft)] text-[var(--platform-text-primary)]"
                  : "border-[var(--platform-border)] text-[var(--platform-text-secondary)] hover:bg-[var(--platform-surface-muted)]"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="status" value={statusFilter} />
        <label className="grid flex-1 gap-1 text-sm">
          <span className="text-[var(--platform-text-muted)]">Search</span>
          <input
            name="q"
            defaultValue={query}
            placeholder="Email, subject, or message"
            className="h-9 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 text-sm text-[var(--platform-text-primary)]"
          />
        </label>
        <button type="submit" className="platform-btn-primary h-9 rounded-[8px] px-4 text-sm font-medium">Search</button>
      </form>

      <AdminContactRequestQueue
        requests={filtered}
        initialExpandedRequestId={focusRequestId || null}
        addressFieldHints={focusRequestId && addressFields.length ? { [focusRequestId]: addressFields } : {}}
        linkedOrders={linkedOrders}
        statusFilter={statusFilter}
        listQuery={query}
        defaultWarehouseCode={policy.defaultWarehouseCode}
        actions={{
          markContacted: markContactRequestContactedFormAction,
          createOrder: promoteContactRequestToOrderFormAction,
          markInProgress: markContactRequestInProgressFormAction,
          requestInfo: requestContactRequestMissingInfoFormAction,
          reject: rejectContactRequestFormAction,
          updateAddress: updateContactRequestAddressClientAction,
          updateContactDetails: updateContactRequestContactDetailsFormAction,
          assignWarehouse: assignLinkedOrderToWarehouseFormAction
        }}
      />
    </div>
  );
}
