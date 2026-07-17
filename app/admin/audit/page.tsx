import { ModulePanel } from "@/components/admin/module-panel";
import { AdminAuditLiveSync } from "@/components/admin/admin-audit-live-sync";
import { AdminAuditLiveFeeds } from "@/components/admin/admin-audit-live-feeds";
import { connectivityMessage } from "@/lib/platform/copy";
import { getAuditObservabilitySnapshot } from "@/services/admin";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [snapshot, policy] = await Promise.all([
    getAuditObservabilitySnapshot(),
    getAdminSettingsPolicy()
  ]);
  const params = searchParams ? await searchParams : {};
  const severityFilter = typeof params.severity === "string" ? params.severity : "";
  const metric = (table: string) => snapshot.data.metrics.find((item) => item.table === table);

  return (
    <div data-admin-audit-route>
      <AdminAuditLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <ModulePanel
        eyebrow="System diagnostics"
        title="System Diagnostics"
        description={connectivityMessage(snapshot.blockedReason) || "Security events, auth activity, denied actions, and audit records for technical review."}
        status={snapshot.status}
        metrics={[
          { label: "Audit rows", value: String(metric("audit_logs")?.count ?? 0) },
          { label: "Activity rows", value: String(metric("activity_logs")?.count ?? 0) },
          { label: "Security events", value: String(metric("security_events")?.count ?? 0) }
        ]}
      >
        <AdminAuditLiveFeeds
          securityEvents={snapshot.data.securityEvents}
          authEvents={snapshot.data.authEvents}
          deniedActions={snapshot.data.deniedActions}
          restDenials={snapshot.data.restDenials}
          privilegeEscalations={snapshot.data.privilegeEscalations}
          realtimeAnomalies={snapshot.data.realtimeAnomalies}
          authAnomalies={snapshot.data.authAnomalies}
          governanceTimeline={snapshot.data.governanceTimeline}
          productActivity={snapshot.data.productActivity}
          auditLogs={snapshot.data.auditLogs}
          notifications={snapshot.data.notifications}
          severityFilter={severityFilter}
        />
      </ModulePanel>
    </div>
  );
}
