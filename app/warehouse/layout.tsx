import { ControlPlaneNavMetricsProvider } from "@/components/platform/control-plane-nav-metrics-provider";
import { ControlPlaneParallelLayout } from "@/components/platform/control-plane-parallel-layout";
import { canAccessProtectedPath, defaultPathForRole } from "@/lib/auth/access-control";
import { readSessionHandoff } from "@/lib/auth/session-handoff";
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
  const handoff = await readSessionHandoff();
  const context = handoff
    ? { userId: handoff.userId, role: handoff.role, disabled: false as const }
    : await getCurrentAuthContext();

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
