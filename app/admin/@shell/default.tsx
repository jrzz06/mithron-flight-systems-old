import { PlatformSidebar } from "@/components/platform/platform-sidebar";
import { PlatformTopbar } from "@/components/platform/platform-topbar";
import { adminRouteTitles, buildAdminNavGroups, buildAdminSearchItems } from "@/components/platform/nav-config";
import { readSessionHandoff } from "@/lib/auth/session-handoff";
import { getCurrentAuthContext } from "@/services/auth";

export default async function AdminShellSlot() {
  // Auth redirect is enforced once in app/admin/layout.tsx — shell only reads context for chrome.
  const handoff = await readSessionHandoff();
  const context = handoff
    ? { userId: handoff.userId, role: handoff.role }
    : await getCurrentAuthContext();
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
