import { SupplierFeedbackDialog } from "@/components/supplier/supplier-feedback-dialog";
import { ControlPlaneNavMetricsProvider } from "@/components/platform/control-plane-nav-metrics-provider";
import { ControlPlaneParallelLayout } from "@/components/platform/control-plane-parallel-layout";
import { canAccessProtectedPath, defaultPathForRole } from "@/lib/auth/access-control";
import { buildAccessDeniedRedirectPath, buildLoginRedirectPath } from "@/lib/auth/redirects";
import { getCurrentAuthContext } from "@/services/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SupplierLayout({
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
    redirect(buildLoginRedirectPath("/supplier"));
  }
  if (!context.role || !canAccessProtectedPath(context.role, "/supplier")) {
    redirect(buildAccessDeniedRedirectPath(defaultPathForRole(context.role), "/supplier"));
  }

  return (
    <>
      <SupplierFeedbackDialog />
      <ControlPlaneNavMetricsProvider scope="supplier">
        <ControlPlaneParallelLayout
          scope="supplier"
          shell={shell}
          shellDataAttributes={{ "data-supplier-frame": true }}
        >
          {children}
        </ControlPlaneParallelLayout>
      </ControlPlaneNavMetricsProvider>
    </>
  );
}
