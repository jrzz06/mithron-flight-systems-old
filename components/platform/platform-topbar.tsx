"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, Plus, Search, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import type { PlatformRouteTitle, PlatformSearchItem, PlatformScope } from "@/components/platform/types";
import { GlobalBusySpinner } from "@/components/ui/global-busy";
import type { EnterpriseRealtimeScope } from "@/services/enterprise-realtime";

type PlatformTopbarProps = {
  role: string | null;
  userId?: string;
  visibleItems: PlatformSearchItem[];
  routeTitles: PlatformRouteTitle[];
  scope?: PlatformScope;
  scopeLabel?: string;
  primaryAction?: { label: string; href: string };
  notificationHref?: string;
};

const defaultQuickActions: PlatformSearchItem[] = [
  { label: "Create product", href: "/admin/products?tool=create#create-product", group: "Action" }
];

function normalizeRole(role: string | null) {
  return role ? role.replaceAll("_", " ") : "Guest";
}

function realtimeScopeForPlatform(scope?: PlatformScope): EnterpriseRealtimeScope | undefined {
  if (scope === "admin") return "admin";
  if (scope === "warehouse") return "warehouse";
  if (scope === "supplier") return "supplier";
  if (scope === "operations") return "operations";
  return undefined;
}

function titleForPath(pathname: string, routeTitles: PlatformRouteTitle[]) {
  if (/^\/supplier\/products\/[^/]+\/edit$/.test(pathname)) {
    return { href: pathname, title: "Edit product", kicker: "Supplier" };
  }
  if (/^\/warehouse\/orders\/[^/]+$/.test(pathname)) {
    return { href: pathname, title: "Order detail", kicker: "Orders" };
  }
  const sorted = [...routeTitles].sort((a, b) => b.href.length - a.href.length);
  return sorted.find((route) => pathname === route.href || pathname.startsWith(`${route.href}/`)) ?? routeTitles.at(-1)!;
}

function resolvePrimaryAction(
  pathname: string,
  scope: PlatformScope | undefined,
  primaryAction: { label: string; href: string } | undefined
) {
  return primaryAction ?? { label: "Add product", href: "/admin/products?tool=create#create-product" };
}

export function PlatformTopbar({
  role,
  userId,
  visibleItems,
  routeTitles,
  scope,
  scopeLabel,
  primaryAction,
  notificationHref = "/admin/suppliers/products"
}: PlatformTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const page = titleForPath(pathname, routeTitles);
  const resolvedPrimaryAction = resolvePrimaryAction(pathname, scope, primaryAction);
  const commandItems = useMemo(() => {
    const includeAdminActions = scope === "admin" || scope === "operations";
    return includeAdminActions ? [...defaultQuickActions, ...visibleItems] : visibleItems;
  }, [scope, visibleItems]);
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commandItems.slice(0, 7);
    return commandItems
      .filter((item) => `${item.group} ${item.label} ${item.href}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [commandItems, query]);

  function prefetchHref(href: string) {
    const target = href.split("#")[0] || href;
    if (!target || target === pathname) return;
    router.prefetch(target);
  }

  return (
    <header
      data-admin-topbar
      className="sticky top-0 z-30 bg-[var(--platform-bg)] px-4 py-3 md:px-6"
      style={{ boxShadow: "var(--platform-shadow-sm)" }}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="type-meta font-medium uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">{scopeLabel ?? page.kicker}</p>
          <h1 className="mt-0.5 truncate text-base font-medium tracking-normal text-[var(--platform-text-primary)] md:text-[17px]">
            {page.title}
          </h1>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 sm:w-[220px] xl:w-[300px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--platform-text-muted)]" aria-hidden="true" />
            <input
              data-admin-command-search
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 120)}
              placeholder="Search"
              aria-label="Search workspace"
              className="h-9 w-full rounded-[8px] border-0 bg-[var(--platform-surface-muted)]/70 pl-9 pr-3 text-sm text-[var(--platform-text-primary)] outline-none transition placeholder:text-[var(--platform-text-muted)] focus:bg-[var(--platform-surface-muted)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
            />
            {open ? (
              <div
                className="absolute left-0 right-0 top-10 z-40 max-h-[min(18rem,calc(100dvh-8rem))] overflow-y-auto rounded-[10px] bg-[var(--platform-surface-raised)]"
                style={{ boxShadow: "var(--platform-shadow-md)" }}
              >
                {filteredItems.length ? (
                  filteredItems.map((item) => (
                    <Link
                      key={`${item.group}-${item.href}-${item.label}`}
                      href={item.href}
                      prefetch
                      onMouseEnter={() => prefetchHref(item.href)}
                      onFocus={() => prefetchHref(item.href)}
                      className="grid gap-0.5 px-3 py-2.5 text-sm text-[var(--platform-text-secondary)] transition-[background-color,color,transform] duration-100 hover:bg-[var(--platform-surface-muted)] hover:text-[var(--platform-text-primary)] active:scale-[0.98]"
                    >
                      <span className="font-medium">{item.label}</span>
                      <span className="text-xs text-[var(--platform-text-muted)]">{item.group}</span>
                    </Link>
                  ))
                ) : (
                  <div className="px-3 py-3 text-sm text-[var(--platform-text-muted)]">No results found.</div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2" data-global-busy-topbar-host>
            <GlobalBusySpinner />
            {resolvedPrimaryAction ? (
              <Link
                href={resolvedPrimaryAction.href}
                prefetch
                onMouseEnter={() => prefetchHref(resolvedPrimaryAction.href)}
                onFocus={() => prefetchHref(resolvedPrimaryAction.href)}
                className="platform-btn-primary h-9 rounded-[8px] px-3 text-sm font-medium"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {resolvedPrimaryAction.label}
              </Link>
            ) : null}
            {userId ? (
              <NotificationBell
                href={notificationHref}
                recipientId={userId}
                realtimeScope={realtimeScopeForPlatform(scope)}
              />
            ) : (
              <Link
                href={notificationHref}
                aria-label="Notifications"
                className="grid h-9 w-9 place-items-center rounded-[10px] bg-[var(--platform-surface-muted)]/70 text-[var(--platform-text-muted)] transition hover:bg-[var(--platform-surface-muted)]"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
            <div className="hidden h-9 items-center gap-2 rounded-[10px] bg-[var(--platform-surface-muted)]/70 px-3 text-sm text-[var(--platform-text-secondary)] md:flex">
              <UserRound className="h-4 w-4 text-[var(--platform-text-muted)]" aria-hidden="true" />
              <span className="max-w-[130px] truncate capitalize">{normalizeRole(role)}</span>
            </div>
            <form action="/auth/logout" method="post">
              <button
                type="submit"
                aria-label="Sign out"
                className="grid h-9 w-9 place-items-center rounded-[10px] bg-[var(--platform-surface-muted)]/70 text-[var(--platform-text-muted)] transition hover:bg-[var(--platform-surface-muted)]"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
