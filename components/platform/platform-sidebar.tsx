import Link from "next/link";
import { PlatformNav } from "@/components/platform/platform-nav";
import type { PlatformNavGroup, PlatformScope } from "@/components/platform/types";

type PlatformSidebarProps = {
  scope: PlatformScope;
  groups: PlatformNavGroup[];
  scopeBadge?: string;
  accentClass?: string;
  homeHref?: string;
};

const scopeLabels: Record<PlatformScope, string> = {
  admin: "Administration",
  warehouse: "Warehouse",
  supplier: "Supplier",
  operations: "Operations"
};

export function PlatformSidebar({
  scope,
  groups,
  scopeBadge,
  accentClass,
  homeHref = "/"
}: PlatformSidebarProps) {
  return (
    <aside className="bg-[var(--platform-surface-raised)] px-3 py-4 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:h-screen lg:w-[248px] lg:flex-col">
      <div className="px-2">
        <Link
          href={homeHref}
          className="block text-[15px] font-medium tracking-tight text-[var(--platform-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--platform-accent)]/30"
        >
          Mithron
        </Link>
        <p className="mt-1 text-[11px] text-[var(--platform-text-muted)]">{scopeLabels[scope]}</p>
        {scopeBadge ? (
          <span className="mt-2 inline-flex rounded-md bg-[var(--platform-surface-muted)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">
            {scopeBadge}
          </span>
        ) : null}
      </div>
      <div className="mt-6 min-h-0 flex-1 lg:overflow-y-auto lg:overscroll-contain">
        <PlatformNav groups={groups} accentClass={accentClass} scope={scope} />
      </div>
    </aside>
  );
}
