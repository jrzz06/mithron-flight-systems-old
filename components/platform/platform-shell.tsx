import type { ReactNode } from "react";
import "@/app/platform.css";
import { OperatorToastBridge } from "@/components/admin/operator-toast-bridge";
import { PlatformSidebar } from "@/components/platform/platform-sidebar";
import { PlatformTopbar } from "@/components/platform/platform-topbar";
import type { PlatformNavGroup, PlatformRouteTitle, PlatformScope, PlatformSearchItem } from "@/components/platform/types";

type PlatformShellProps = {
  scope: PlatformScope;
  groups: PlatformNavGroup[];
  routeTitles: PlatformRouteTitle[];
  searchItems: PlatformSearchItem[];
  role?: string | null;
  userId?: string | null;
  scopeBadge?: string;
  accentClass?: string;
  homeHref?: string;
  shellDataAttributes?: Record<string, string | boolean>;
  contentDataAttribute?: string;
  showTopbar?: boolean;
  primaryAction?: { label: string; href: string };
  notificationHref?: string;
  children: ReactNode;
};

export function PlatformShell({
  scope,
  groups,
  routeTitles,
  searchItems,
  role = null,
  userId,
  scopeBadge,
  accentClass = "bg-[var(--platform-nav-active-bg)] text-[var(--platform-text-primary)]",
  homeHref,
  shellDataAttributes = {},
  contentDataAttribute = "data-platform-content",
  showTopbar = true,
  primaryAction,
  notificationHref,
  children
}: PlatformShellProps) {
  const defaultHome = scope === "admin" ? "/admin" : scope === "warehouse" ? "/warehouse/dashboard" : scope === "supplier" ? "/supplier" : "/operations";

  return (
    <main
      data-control-plane
      data-control-plane-scope={scope}
      data-control-plane-theme="dark"
      data-admin-performance-theme
      {...shellDataAttributes}
      className="min-h-screen bg-[var(--platform-bg)] text-[var(--platform-text-primary)]"
    >
      <OperatorToastBridge />
      <div className="min-h-screen lg:pl-[248px]">
        <PlatformSidebar
          scope={scope}
          groups={groups}
          scopeBadge={scopeBadge}
          accentClass={accentClass}
          homeHref={homeHref ?? defaultHome}
        />
        <section className="min-w-0">
          {showTopbar ? (
            <PlatformTopbar
              role={role}
              userId={userId ?? undefined}
              visibleItems={searchItems}
              routeTitles={routeTitles}
              scope={scope}
              primaryAction={primaryAction}
              notificationHref={notificationHref}
            />
          ) : null}
          <div {...{ [contentDataAttribute]: true }} data-admin-content className="px-4 py-5 md:px-6 md:py-6">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
