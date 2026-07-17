import { PlatformShell } from "@/components/platform/platform-shell";
import { supplierNavGroups, supplierRouteTitles } from "@/components/platform/nav-config";
import { SupplierFeedbackDialog } from "@/components/supplier/supplier-feedback-dialog";

export function SupplierFrame({
  children,
  recipientId,
  role
}: {
  children: React.ReactNode;
  recipientId?: string;
  role?: string | null;
}) {
  return (
    <>
      <SupplierFeedbackDialog />
      <PlatformShell
        scope="supplier"
        groups={supplierNavGroups}
        routeTitles={supplierRouteTitles}
        searchItems={supplierNavGroups.flatMap((group) => group.items.map((item) => ({ label: item.label, href: item.href, group: group.label })))}
        userId={recipientId}
        role={role ?? "supplier"}
        scopeBadge="Supplier"
        accentClass="bg-[var(--platform-nav-active-bg)] text-[var(--platform-text-primary)]"
        shellDataAttributes={{ "data-supplier-frame": true }}
        primaryAction={{ label: "Add product", href: "/supplier/products/new" }}
        notificationHref="/supplier/submissions"
      >
        {children}
      </PlatformShell>
    </>
  );
}
