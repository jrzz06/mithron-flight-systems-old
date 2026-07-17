import type { CmsRole } from "@/lib/auth/access-control";
import { AdminNavMetricsProvider } from "@/components/admin/admin-nav-metrics-provider";
import { PlatformShell } from "@/components/platform/platform-shell";
import { adminRouteTitles, buildAdminNavGroups, buildAdminSearchItems } from "@/components/platform/nav-config";

type AdminFrameProps = {
  role: CmsRole | null;
  userId?: string | null;
  children: React.ReactNode;
};

export function AdminFrame({ role, userId, children }: AdminFrameProps) {
  const groups = buildAdminNavGroups(role, 0);
  const searchItems = buildAdminSearchItems(groups);

  return (
    <AdminNavMetricsProvider>
      <PlatformShell
        scope="admin"
        groups={groups}
        routeTitles={adminRouteTitles}
        searchItems={searchItems}
        role={role}
        userId={userId}
        scopeBadge="Admin"
        shellDataAttributes={{ "data-admin-shell": true }}
      >
        {children}
      </PlatformShell>
    </AdminNavMetricsProvider>
  );
}
