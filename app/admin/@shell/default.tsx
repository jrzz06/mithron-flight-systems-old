import { PlatformSidebar } from "@/components/platform/platform-sidebar";
import { PlatformTopbar } from "@/components/platform/platform-topbar";
import { adminRouteTitles, buildAdminNavGroups, buildAdminSearchItems } from "@/components/platform/nav-config";
import { assertRouteAccessOrRedirect } from "@/services/auth";

export default async function AdminShellSlot() {
  const context = await assertRouteAccessOrRedirect("/admin");
  const groups = buildAdminNavGroups(context.role, 0);
  const searchItems = buildAdminSearchItems(groups);

  return (
    <>
      <PlatformSidebar scope="admin" groups={groups} scopeBadge="Admin" homeHref="/admin" />
      <PlatformTopbar
        role={context.role}
        userId={context.userId ?? undefined}
        visibleItems={searchItems}
        routeTitles={adminRouteTitles}
        scope="admin"
      />
    </>
  );
}
