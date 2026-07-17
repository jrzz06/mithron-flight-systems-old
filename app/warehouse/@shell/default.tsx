import { PlatformSidebar } from "@/components/platform/platform-sidebar";
import { PlatformTopbar } from "@/components/platform/platform-topbar";
import { warehouseNavGroups, warehouseRouteTitles } from "@/components/platform/nav-config";
import { canAccessProtectedPath } from "@/lib/auth/access-control";
import { readSessionHandoff } from "@/lib/auth/session-handoff";
import { getCurrentAuthContext } from "@/services/auth";
import { redirect } from "next/navigation";

export default async function WarehouseShellSlot() {
  const handoff = await readSessionHandoff();
  const context = handoff
    ? { userId: handoff.userId, role: handoff.role, disabled: false as const }
    : await getCurrentAuthContext();

  if (!context.userId || !context.role || !canAccessProtectedPath(context.role, "/warehouse")) {
    redirect("/login?next=%2Fwarehouse%2Fdashboard");
  }

  const searchItems = warehouseNavGroups.flatMap((group) =>
    group.items.map((item) => ({ label: item.label, href: item.href, group: group.label }))
  );

  return (
    <>
      <PlatformSidebar
        scope="warehouse"
        groups={warehouseNavGroups}
        accentClass="bg-[var(--platform-nav-active-bg)] text-[var(--platform-text-primary)]"
        homeHref="/warehouse/dashboard"
      />
      <PlatformTopbar
        role={context.role}
        userId={context.userId ?? undefined}
        visibleItems={searchItems}
        routeTitles={warehouseRouteTitles}
        scope="warehouse"
        primaryAction={{ label: "Orders", href: "/warehouse/orders" }}
        notificationHref="/warehouse/orders"
      />
    </>
  );
}
