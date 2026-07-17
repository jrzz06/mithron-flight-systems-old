"use client";

import { useEffect, useMemo, useRef } from "react";
import { DataList } from "@/components/admin/module-panel";
import {
  useAdminLiveResource,
  useOptionalAdminRealtime
} from "@/components/admin/realtime/admin-realtime-provider";
import type { AdminEntityRow } from "@/lib/admin/realtime/admin-entity-store";

type AuditRow = Record<string, unknown>;

function formatDate(value: unknown) {
  return typeof value === "string" && value ? new Date(value).toLocaleString() : "not recorded";
}

function detailFromMetadata(row: AuditRow) {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const actorRole = metadata.actor_role ? `role ${String(metadata.actor_role)}` : null;
  const reason = metadata.denial_reason ? `reason ${String(metadata.denial_reason)}` : null;
  const summary = metadata.change_summary ? `summary ${String(metadata.change_summary)}` : null;
  return [actorRole, reason, summary, formatDate(row.created_at)].filter(Boolean).join(" | ");
}

function listRows(rows: AuditRow[], fallback: string) {
  if (!rows.length) {
    return [{ label: fallback, value: "0", detail: "No rows loaded for this feed yet." }];
  }

  return rows.slice(0, 8).map((row) => ({
    label: String(row.action ?? row.event_type ?? row.title ?? row.entity_table ?? "audit event"),
    value: String(row.severity ?? row.status ?? row.priority ?? "recorded"),
    detail: detailFromMetadata(row)
  }));
}

function rowId(row: AdminEntityRow) {
  const value = row.id;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function mergeByIdentity(ssrRows: AdminEntityRow[], liveRows: AdminEntityRow[]): AdminEntityRow[] {
  if (!liveRows.length) return ssrRows;
  const map = new Map<string, AdminEntityRow>();
  for (const row of ssrRows) {
    const id = rowId(row);
    if (id) map.set(id, row);
  }
  for (const row of liveRows) {
    const id = rowId(row);
    if (!id) continue;
    map.set(id, { ...(map.get(id) ?? {}), ...row });
  }
  return Array.from(map.values());
}

function mergeSubset(ssrRows: AdminEntityRow[], liveRows: AdminEntityRow[]): AdminEntityRow[] {
  const liveById = new Map<string, AdminEntityRow>();
  for (const row of liveRows) {
    const id = rowId(row);
    if (id) liveById.set(id, row);
  }
  return ssrRows.map((row) => {
    const id = rowId(row);
    if (!id) return row;
    const live = liveById.get(id);
    return live ? { ...row, ...live } : row;
  });
}

function useAuditLiveRows(
  table: "security_events" | "activity_logs" | "audit_logs",
  ssrRows: AuditRow[],
  includeLiveInserts = false
) {
  const realtime = useOptionalAdminRealtime();
  useAdminLiveResource("audit", Boolean(realtime));

  return useMemo(() => {
    if (!realtime) return ssrRows;
    const liveRows = realtime.getCollection(table) ?? [];
    const merged = includeLiveInserts
      ? mergeByIdentity(ssrRows as AdminEntityRow[], liveRows)
      : mergeSubset(ssrRows as AdminEntityRow[], liveRows);
    return merged as AuditRow[];
  }, [includeLiveInserts, realtime, realtime?.collections[table], ssrRows, table]);
}

function AuditLiveDataList({
  table,
  rows,
  fallback
}: {
  table: "security_events" | "activity_logs" | "audit_logs";
  rows: AuditRow[];
  fallback: string;
}) {
  const liveRows = useAuditLiveRows(table, rows);
  return <DataList rows={listRows(liveRows, fallback)} />;
}

type AdminAuditLiveFeedsProps = {
  securityEvents: AuditRow[];
  authEvents: AuditRow[];
  deniedActions: AuditRow[];
  restDenials: AuditRow[];
  privilegeEscalations: AuditRow[];
  realtimeAnomalies: AuditRow[];
  authAnomalies: AuditRow[];
  governanceTimeline: AuditRow[];
  productActivity: AuditRow[];
  auditLogs: AuditRow[];
  notifications: AuditRow[];
  severityFilter: string;
};

export function AdminAuditLiveFeeds({
  securityEvents,
  authEvents,
  deniedActions,
  restDenials,
  privilegeEscalations,
  realtimeAnomalies,
  authAnomalies,
  governanceTimeline,
  productActivity,
  auditLogs,
  notifications,
  severityFilter
}: AdminAuditLiveFeedsProps) {
  const realtime = useOptionalAdminRealtime();
  const hydratedRef = useRef(false);

  const securitySsr = useMemo(
    () => mergeByIdentity(
      [],
      [
        ...securityEvents,
        ...restDenials,
        ...privilegeEscalations,
        ...realtimeAnomalies,
        ...authAnomalies
      ] as AdminEntityRow[]
    ),
    [authAnomalies, privilegeEscalations, realtimeAnomalies, restDenials, securityEvents]
  );

  const activitySsr = useMemo(
    () => mergeByIdentity(
      [],
      [
        ...authEvents,
        ...deniedActions,
        ...governanceTimeline,
        ...productActivity
      ] as AdminEntityRow[]
    ),
    [authEvents, deniedActions, governanceTimeline, productActivity]
  );

  useEffect(() => {
    if (!realtime || hydratedRef.current) return;
    realtime.hydrateResource("audit", {
      security_events: securitySsr,
      activity_logs: activitySsr,
      audit_logs: auditLogs as AdminEntityRow[]
    });
    hydratedRef.current = true;
  }, [activitySsr, auditLogs, realtime, securitySsr]);

  const liveSecurity = useAuditLiveRows("security_events", securityEvents, true);
  const filteredSecurity = severityFilter
    ? liveSecurity.filter((row) => String(row.severity ?? "") === severityFilter)
    : liveSecurity;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section data-security-events-feed className="rounded-2xl border border-white/10 bg-black/18 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/68">Security events</h2>
          <form className="flex items-center gap-2">
            <select name="severity" defaultValue={severityFilter} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white">
              <option value="">All severities</option>
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="critical">critical</option>
            </select>
            <button type="submit" className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/80">Filter</button>
          </form>
        </div>
        <div className="mt-4">
          <DataList rows={listRows(filteredSecurity, "security_events")} />
        </div>
      </section>

      <section data-auth-events-feed className="rounded-2xl border border-white/10 bg-black/18 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/68">Auth events</h2>
        <div className="mt-4">
          <AuditLiveDataList table="activity_logs" rows={authEvents} fallback="auth activity" />
        </div>
      </section>

      <section data-denied-action-feed className="rounded-2xl border border-white/10 bg-black/18 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/68">Denied action feed</h2>
        <div className="mt-4">
          <AuditLiveDataList table="activity_logs" rows={deniedActions} fallback="denied actions" />
        </div>
      </section>

      <section data-rest-rls-denials-feed className="rounded-2xl border border-white/10 bg-black/18 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/68">REST/RLS denials</h2>
        <div className="mt-4">
          <AuditLiveDataList table="security_events" rows={restDenials} fallback="REST/RLS denials" />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/18 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/68">Privilege escalation attempts</h2>
        <div className="mt-4">
          <AuditLiveDataList table="security_events" rows={privilegeEscalations} fallback="privilege escalation attempts" />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/18 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/68">Realtime anomalies</h2>
        <div className="mt-4">
          <AuditLiveDataList table="security_events" rows={realtimeAnomalies} fallback="realtime anomalies" />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/18 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/68">Auth anomaly feed</h2>
        <div className="mt-4">
          <AuditLiveDataList table="security_events" rows={authAnomalies} fallback="auth anomalies" />
        </div>
      </section>

      <section data-governance-timeline-feed className="rounded-2xl border border-white/10 bg-black/18 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/68">Governance timeline</h2>
        <div className="mt-4">
          <AuditLiveDataList table="activity_logs" rows={governanceTimeline} fallback="governance timeline" />
        </div>
      </section>

      <section data-product-activity-feed className="rounded-2xl border border-white/10 bg-black/18 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/68">Product activity</h2>
        <div className="mt-4">
          <AuditLiveDataList table="activity_logs" rows={productActivity} fallback="product activity" />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/18 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/68">Audit log stream</h2>
        <div className="mt-4">
          <AuditLiveDataList table="audit_logs" rows={auditLogs} fallback="audit logs" />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/18 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/68">Notification evidence</h2>
        <div className="mt-4">
          <DataList rows={listRows(notifications, "notifications")} />
        </div>
      </section>
    </div>
  );
}
