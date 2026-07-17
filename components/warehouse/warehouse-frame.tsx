import { PlatformShell } from "@/components/platform/platform-shell";
import { warehouseNavGroups, warehouseRouteTitles } from "@/components/platform/nav-config";

export function WarehouseFrame({ children }: { children: React.ReactNode }) {
  return (
    <PlatformShell
      scope="warehouse"
      groups={warehouseNavGroups}
      routeTitles={warehouseRouteTitles}
      searchItems={warehouseNavGroups.flatMap((group) => group.items.map((item) => ({ label: item.label, href: item.href, group: group.label })))}
      accentClass="bg-[var(--platform-nav-active-bg)] text-[var(--platform-text-primary)]"
      shellDataAttributes={{ "data-warehouse-frame": true }}
      primaryAction={{ label: "Orders", href: "/warehouse/orders" }}
      notificationHref="/warehouse/orders"
      showTopbar
    >
      {children}
    </PlatformShell>
  );
}
