import { PlatformSidebar } from "@/components/platform/platform-sidebar";
import { PlatformTopbar } from "@/components/platform/platform-topbar";
import { supplierNavGroups, supplierRouteTitles } from "@/components/platform/nav-config";
import { getCurrentAuthContext } from "@/services/auth";

export default async function SupplierShellSlot() {
  // Auth redirect is enforced once in app/supplier/layout.tsx — shell only reads context for chrome.
  const context = await getCurrentAuthContext();
  const searchItems = supplierNavGroups.flatMap((group) =>
    group.items.map((item) => ({ label: item.label, href: item.href, group: group.label }))
  );

  return (
    <>
      <PlatformSidebar
        scope="supplier"
        groups={supplierNavGroups}
        scopeBadge="Supplier"
        accentClass="bg-[var(--platform-nav-active-bg)] text-[var(--platform-text-primary)]"
        homeHref="/supplier"
      />
      <PlatformTopbar
        role={context.role ?? "supplier"}
        userId={context.userId ?? undefined}
        visibleItems={searchItems}
        routeTitles={supplierRouteTitles}
        scope="supplier"
        primaryAction={{ label: "Add product", href: "/supplier/products/new" }}
        notificationHref="/supplier/submissions"
      />
    </>
  );
}
