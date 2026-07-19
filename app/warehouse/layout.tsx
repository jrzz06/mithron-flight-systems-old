import { ControlPlaneNavMetricsProvider } from "@/components/platform/control-plane-nav-metrics-provider";
import { ControlPlaneParallelLayout } from "@/components/platform/control-plane-parallel-layout";
import { canAccessProtectedPath, defaultPathForRole } from "@/lib/auth/access-control";
import { getCurrentAuthContext } from "@/services/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function WarehouseLayout({
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
    redirect(`/login?next=${encodeURIComponent("/warehouse/dashboard")}`);
  }
  if (!context.role || !canAccessProtectedPath(context.role, "/warehouse")) {
    redirect(`${defaultPathForRole(context.role)}?access_status=forbidden&next=${encodeURIComponent("/warehouse/dashboard")}`);
  }

  return (
    <ControlPlaneNavMetricsProvider scope="warehouse">
      <ControlPlaneParallelLayout
        scope="warehouse"
        shell={shell}
        shellDataAttributes={{ "data-warehouse-frame": true }}
      >
        {children}
      </ControlPlaneParallelLayout>
    </ControlPlaneNavMetricsProvider>
  );
}
