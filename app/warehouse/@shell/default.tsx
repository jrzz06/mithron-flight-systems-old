import { PlatformSidebar } from "@/components/platform/platform-sidebar";
import { PlatformTopbar } from "@/components/platform/platform-topbar";
import { warehouseNavGroups, warehouseRouteTitles } from "@/components/platform/nav-config";
import { getCurrentAuthContext } from "@/services/auth";

export default async function WarehouseShellSlot() {
  // Auth redirect is enforced once in app/warehouse/layout.tsx — shell only reads context for chrome.
  const context = await getCurrentAuthContext();
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
