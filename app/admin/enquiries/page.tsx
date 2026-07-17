import Link from "next/link";
import { Suspense } from "react";
import {
  addEnquiryNoteFormAction,
  closeEnquiryFormAction,
  convertEnquiryToOrderFormAction,
  markEnquiryCompleteFormAction,
  markEnquiryContactedFormAction,
  markEnquiryInProgressFormAction,
  rejectEnquiryFormAction,
  requestEnquiryMissingInfoFormAction,
  updateEnquiryAddressFormAction,
  updateEnquiryContactDetailsFormAction,
  updateEnquiryMetaFormAction
} from "@/app/admin/enquiries/actions";
import { assignLinkedOrderToWarehouseFormAction } from "@/app/admin/enquiries/warehouse-actions";
import { AdminEnquiryQueue } from "@/components/admin/admin-enquiry-queue";
import { EnquiryQueueLiveSync } from "@/components/admin/enquiry-queue-live-sync";
import { loadLinkedOrderSummaries } from "@/lib/admin/linked-orders";
import { listAdminEnquiries } from "@/services/enquiries";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";

export const dynamic = "force-dynamic";
/** Bound the heaviest enquiry action (~6 sequential REST calls × 10s timeout) so Vercel hard-kills instead of leaving pending forever. */
export const maxDuration = 60;

type SearchParams = Record<string, string | string[] | undefined>;

const statusTabs = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "contacted", label: "In touch" },
  { key: "qualified", label: "Ready for order" },
  { key: "converted", label: "Converted" },
  { key: "lost", label: "Closed" }
] as const;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}


export default async function AdminEnquiriesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const statusFilter = searchValue(params, "status") || "all";
  const query = searchValue(params, "q");
  const [enquiries, policy] = await Promise.all([
    listAdminEnquiries({ status: statusFilter, q: query }),
    getAdminSettingsPolicy()
  ]);
  const focusEnquiryId = searchValue(params, "open") || searchValue(params, "enquiry_id");
  const addressFields = searchValue(params, "address_fields")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);

  const filtered = enquiries;
  const linkedOrderIds = filtered
    .map((enquiry) => String(enquiry.order_id ?? enquiry.converted_order_id ?? "").trim())
    .filter(Boolean);
  const linkedOrders = await loadLinkedOrderSummaries(linkedOrderIds);

  return (
    <div className="grid gap-4" data-admin-enquiries-page>
      <EnquiryQueueLiveSync enabled={policy.realtimeUpdatesEnabled} />

      <nav className="flex flex-nowrap gap-2 overflow-x-auto" aria-label="Enquiry status filters">
        {statusTabs.map((tab) => {
          const active = statusFilter === tab.key;
          const href = `/admin/enquiries?status=${tab.key}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
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

      <Suspense
        fallback={
          <p className="rounded-[8px] border border-dashed border-[var(--platform-border)] px-4 py-8 text-center text-sm text-[var(--platform-text-muted)]">
            Loading enquiries…
          </p>
        }
      >
        <AdminEnquiryQueue
          enquiries={filtered}
          listStatus={statusFilter}
          listQuery={query}
          initialExpandedEnquiryId={focusEnquiryId || null}
          addressFieldHints={focusEnquiryId && addressFields.length ? { [focusEnquiryId]: addressFields } : {}}
          linkedOrders={linkedOrders}
          defaultWarehouseCode={policy.defaultWarehouseCode}
          actions={{
            markContacted: markEnquiryContactedFormAction,
            addNote: addEnquiryNoteFormAction,
            convert: convertEnquiryToOrderFormAction,
            close: closeEnquiryFormAction,
            markInProgress: markEnquiryInProgressFormAction,
            complete: markEnquiryCompleteFormAction,
            requestInfo: requestEnquiryMissingInfoFormAction,
            cancel: rejectEnquiryFormAction,
            updateMeta: updateEnquiryMetaFormAction,
            updateAddress: updateEnquiryAddressFormAction,
            updateContactDetails: updateEnquiryContactDetailsFormAction,
            assignWarehouse: assignLinkedOrderToWarehouseFormAction
          }}
        />
      </Suspense>
    </div>
  );
}
