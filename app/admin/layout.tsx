import { ControlPlaneNavMetricsProvider } from "@/components/platform/control-plane-nav-metrics-provider";
import { ControlPlaneParallelLayout } from "@/components/platform/control-plane-parallel-layout";
import { AdminRealtimeShell } from "@/components/admin/realtime/admin-realtime-shell";
import { canAccessProtectedPath, defaultPathForRole } from "@/lib/auth/access-control";
import { buildAccessDeniedRedirectPath, buildLoginRedirectPath } from "@/lib/auth/redirects";
import { getCurrentAuthContext } from "@/services/auth";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
  shell
}: {
  children: React.ReactNode;
  shell: React.ReactNode;
}) {
  // Always resolve via getCurrentAuthContext so handoff headers are cross-checked
  // against the JWT (layouts must not trust x-mithron-auth-* alone).
  const context = await getCurrentAuthContext();

  if (!context.userId) {
    redirect(buildLoginRedirectPath("/admin"));
  }
  if (!context.role || !canAccessProtectedPath(context.role, "/admin")) {
    redirect(buildAccessDeniedRedirectPath(defaultPathForRole(context.role), "/admin"));
  }

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
