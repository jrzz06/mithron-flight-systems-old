import Link from "next/link";
import { AdminArchiveDownloadBar } from "@/components/admin/admin-archive-download-bar";
import { AdminArchivesLiveSync } from "@/components/admin/admin-archives-live-sync";
import { AdminArchivesRunsLiveList } from "@/components/admin/admin-archives-runs-live-list";
import { DataList, ModulePanel } from "@/components/admin/module-panel";
import {
  archiveCsvStoragePath,
  listArchivedContactRequests,
  listArchivedEnquiries,
  listArchivedLogs,
  listArchivedOrders,
  listDataArchiveRuns,
  type ArchiveEntity
} from "@/services/data-archive";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type ArchiveTab = "orders" | "enquiries" | "contact_requests" | "logs" | "exports";

const tabs: Array<{ key: ArchiveTab; label: string; entity?: ArchiveEntity }> = [
  { key: "orders", label: "Orders", entity: "orders" },
  { key: "enquiries", label: "Enquiries", entity: "enquiries" },
  { key: "contact_requests", label: "Contact requests", entity: "contact_requests" },
  { key: "logs", label: "Logs" },
  { key: "exports", label: "Export files" }
];

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatDate(value: unknown) {
  return typeof value === "string" && value ? new Date(value).toLocaleString() : "—";
}

export default async function AdminArchivesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const tab = (searchValue(params, "tab") || "orders") as ArchiveTab;
  const query = searchValue(params, "q");
  const logKind = searchValue(params, "log_kind") === "audit" ? "audit" : "activity";
  const activeTab = tabs.find((entry) => entry.key === tab);

  const [orders, enquiries, contactRequests, logs, runs, policy] = await Promise.all([
    tab === "orders" ? listArchivedOrders({ query, limit: 50 }) : Promise.resolve([]),
    tab === "enquiries" ? listArchivedEnquiries({ query, limit: 50 }) : Promise.resolve([]),
    tab === "contact_requests" ? listArchivedContactRequests({ query, limit: 50 }) : Promise.resolve([]),
    tab === "logs" ? listArchivedLogs({ kind: logKind, limit: 50 }) : Promise.resolve([]),
    listDataArchiveRuns(40),
    getAdminSettingsPolicy()
  ]);

  const listRows = () => {
    if (tab === "orders") {
      if (!orders.length) return [{ label: "Archived orders", value: "0", detail: "No archived orders match this filter." }];
      return orders.map((row) => ({
        label: text(row.order_number, text(row.id, "order")),
        value: text(row.status, "archived"),
        detail: `${text(row.customer_email, "No email")} | ${formatDate(row.created_at)} | archived ${formatDate(row.archived_at)}`
      }));
    }
    if (tab === "enquiries") {
      if (!enquiries.length) return [{ label: "Archived enquiries", value: "0", detail: "No archived enquiries match this filter." }];
      return enquiries.map((row) => ({
        label: text(row.subject, "Enquiry"),
        value: text(row.status, "archived"),
        detail: `${text(row.customer_email, "No email")} | ${formatDate(row.created_at)}`
      }));
    }
    if (tab === "contact_requests") {
      if (!contactRequests.length) return [{ label: "Archived contact requests", value: "0", detail: "No archived contact requests match this filter." }];
      return contactRequests.map((row) => ({
        label: text(row.subject, "Contact request"),
        value: text(row.status, "archived"),
        detail: `${text(row.customer_email, "No email")} | ${formatDate(row.created_at)}`
      }));
    }
    if (tab === "logs") {
      if (!logs.length) return [{ label: "Archived logs", value: "0", detail: "No archived logs loaded." }];
      return logs.map((row) => ({
        label: text(row.action, "log"),
        value: text(row.severity, text(row.entity_table, "recorded")),
        detail: `${text(row.entity_table)} ${text(row.entity_id)} | ${formatDate(row.created_at)}`
      }));
    }
    return [{ label: "Archive runs", value: "0", detail: "No monthly archive runs recorded yet." }];
  };

  return (
    <div data-admin-archives-route>
      <AdminArchivesLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <ModulePanel
        eyebrow="Cold storage"
        title="Archives"
        description="Orders, enquiries, contact requests, and logs older than 30 days are moved here and exported as monthly CSV sheets."
        status="LIVE"
        metrics={[
          { label: "Recent runs", value: String(runs.length) },
          { label: "Hot window", value: "30 days" }
        ]}
      >
        <nav className="mb-4 flex flex-wrap gap-2" aria-label="Archive sections">
          {tabs.map((entry) => {
            const active = tab === entry.key;
            const href = `/admin/archives?tab=${entry.key}${query ? `&q=${encodeURIComponent(query)}` : ""}${entry.key === "logs" ? `&log_kind=${logKind}` : ""}`;
            return (
              <Link
                key={entry.key}
                href={href}
                className={`rounded-[8px] border px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "border-[var(--platform-accent)]/40 bg-[var(--platform-accent-soft)] text-[var(--platform-text-primary)]"
                    : "border-[var(--platform-border)] text-[var(--platform-text-secondary)] hover:bg-[var(--platform-surface-muted)]"
                }`}
              >
                {entry.label}
              </Link>
            );
          })}
        </nav>

        {tab === "logs" ? (
          <AdminArchiveDownloadBar
            activeEntity={logKind === "audit" ? "audit_logs" : "activity_logs"}
          />
        ) : tab === "exports" ? (
          <AdminArchiveDownloadBar showAllDownloads />
        ) : activeTab?.entity ? (
          <AdminArchiveDownloadBar activeEntity={activeTab.entity} />
        ) : null}

        {tab !== "exports" && tab !== "logs" ? (
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value={tab} />
            <label className="grid flex-1 gap-1 text-sm">
              <span className="text-[var(--platform-text-muted)]">Search</span>
              <input
                name="q"
                defaultValue={query}
                placeholder="Email, subject, or order number"
                className="h-9 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 text-sm"
              />
            </label>
            <button type="submit" className="platform-btn-primary h-9 rounded-[8px] px-4 text-sm font-medium">Search</button>
          </form>
        ) : null}

        {tab === "logs" ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <Link
              href={`/admin/archives?tab=logs&log_kind=activity${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className={`rounded-[8px] border px-3 py-1.5 text-sm ${logKind === "activity" ? "border-[var(--platform-accent)]/40 bg-[var(--platform-accent-soft)]" : "border-[var(--platform-border)]"}`}
            >
              Activity logs
            </Link>
            <Link
              href={`/admin/archives?tab=logs&log_kind=audit${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className={`rounded-[8px] border px-3 py-1.5 text-sm ${logKind === "audit" ? "border-[var(--platform-accent)]/40 bg-[var(--platform-accent-soft)]" : "border-[var(--platform-border)]"}`}
            >
              Audit logs
            </Link>
          </div>
        ) : null}

        {tab === "exports" ? (
          <AdminArchivesRunsLiveList runs={runs} />
        ) : (
          <section className="rounded-2xl border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-5">
            <DataList rows={listRows()} />
          </section>
        )}

        {tab === "exports" ? (
          <p className="mt-4 text-xs text-[var(--platform-text-muted)]">
            Live exports read the full archive tables. Monthly snapshots are stored at {archiveCsvStoragePath("orders", "YYYY-MM")}.
          </p>
        ) : null}
      </ModulePanel>
    </div>
  );
}
