"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ControlShellAction = {
  label: string;
  href: string;
};

function isActivePath(pathname: string, href: string) {
  const baseHref = href.split("#")[0] || href;
  return pathname === baseHref || pathname.startsWith(`${baseHref}/`);
}

export function ControlShellActionNav({ actions }: { actions: ControlShellAction[] }) {
  const pathname = usePathname();
  if (!actions.length) return null;

  return (
    <nav data-control-shell-action-nav className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const active = isActivePath(pathname, action.href);
        return (
          <Link
            key={action.href}
            href={action.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-[var(--platform-radius)] border px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "border-[color-mix(in_srgb,var(--platform-accent)_40%,transparent)] bg-[var(--platform-accent-soft)] text-[var(--platform-text-primary)]"
                : "border-[var(--platform-border)] bg-[var(--platform-surface)] text-[var(--platform-text-secondary)] hover:border-[var(--platform-border-strong)] hover:bg-[var(--platform-surface-muted)] hover:text-[var(--platform-text-primary)]"
            }`}
          >
            {action.label}
          </Link>
        );
      })}
    </nav>
  );
}
