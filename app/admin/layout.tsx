import { ControlPlaneNavMetricsProvider } from "@/components/platform/control-plane-nav-metrics-provider";
import { ControlPlaneParallelLayout } from "@/components/platform/control-plane-parallel-layout";
import { AdminRealtimeShell } from "@/components/admin/realtime/admin-realtime-shell";
import { assertRouteAccessOrRedirect } from "@/services/auth";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
  shell
}: {
  children: React.ReactNode;
  shell: React.ReactNode;
}) {
  await assertRouteAccessOrRedirect("/admin");
  const policy = await getAdminSettingsPolicy();

  return (
    <ControlPlaneNavMetricsProvider scope="admin">
      <AdminRealtimeShell enabled={policy.realtimeUpdatesEnabled}>
        <ControlPlaneParallelLayout scope="admin" shell={shell} shellDataAttributes={{ "data-admin-shell": true }}>
          {children}
        </ControlPlaneParallelLayout>
      </AdminRealtimeShell>
    </ControlPlaneNavMetricsProvider>
  );
}
