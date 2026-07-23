"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  Boxes,
  ClipboardList,
  FileText,
  Gauge,
  Images,
  LayoutDashboard,
  LineChart,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  type LucideIcon
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useControlPlaneNavMetrics } from "@/components/platform/control-plane-nav-metrics-provider";
import { PlatformNavBadge } from "@/components/platform/platform-nav-badge";
import type { PlatformNavGroup, PlatformNavIconKey, PlatformScope } from "@/components/platform/types";

const iconByKey: Record<PlatformNavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  products: Package,
  orders: ShoppingCart,
  inventory: Boxes,
  media: Images,
  cms: FileText,
  users: Users,
  settings: Settings,
  operations: ClipboardList,
  reports: LineChart,
  suppliers: Users,
  enquiries: Bell,
  audit: BarChart3,
  gauge: Gauge,
  truck: Truck,
  fulfillment: ClipboardList,
  history: BarChart3,
  returns: Package
};

function isActivePath(pathname: string, href: string) {
  const baseHref = href.split("#")[0] || href;
  if (baseHref === "/") return pathname === "/";
  if (baseHref === "/admin") return pathname === "/admin";
  if (baseHref === "/supplier") return pathname === "/supplier";
  if (baseHref === "/warehouse/dashboard") return pathname === "/warehouse/dashboard" || pathname === "/warehouse";
  return pathname === baseHref || pathname.startsWith(`${baseHref}/`);
}

type PlatformNavProps = {
  groups: PlatformNavGroup[];
  accentClass?: string;
  dataAttribute?: string;
  scope?: PlatformScope;
};

export function PlatformNav({ groups, dataAttribute = "data-platform-nav", scope }: PlatformNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navMetrics = useControlPlaneNavMetrics();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.filter((group) => group.defaultCollapsed).map((group) => [group.label, true]))
  );

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  function badgeCountForItem(href: string, fallback = 0) {
    if (scope === "admin" && href.startsWith("/admin/suppliers/products")) {
      return navMetrics.admin.pendingSupplierApprovals;
    }
    if (scope === "admin" && href.startsWith("/admin/orders")) {
      return navMetrics.admin.pendingOrdersReview;
    }
    if (scope === "admin" && href.startsWith("/admin/enquiries")) {
      return navMetrics.admin.newEnquiries;
    }
    if (scope === "admin" && href.startsWith("/admin/contact-requests")) {
      return navMetrics.admin.newContactRequests;
    }
    if (scope === "warehouse" && href.startsWith("/warehouse/fulfillment")) {
      return navMetrics.warehouse.fulfillmentPending;
    }
    if (scope === "supplier" && href.startsWith("/supplier/submissions")) {
      return navMetrics.supplier.pendingReview;
    }
    if (scope === "supplier" && href.startsWith("/supplier/products")) {
      return navMetrics.supplier.needsAction;
    }
    if (scope === "supplier" && href.startsWith("/supplier/inventory")) {
      return navMetrics.supplier.inventoryAlerts;
    }
    return fallback;
  }

  function badgeLabelForItem(href: string) {
    if (scope === "admin" && href.startsWith("/admin/suppliers/products")) {
      return "pending supplier submissions";
    }
    if (scope === "admin" && href.startsWith("/admin/orders")) {
      return "orders needing review";
    }
    if (scope === "admin" && href.startsWith("/admin/enquiries")) {
      return "new enquiries";
    }
    if (scope === "admin" && href.startsWith("/admin/contact-requests")) {
      return "new contact requests";
    }
    if (scope === "warehouse" && href.startsWith("/warehouse/fulfillment")) {
      return "orders awaiting fulfillment";
    }
    if (scope === "supplier" && href.startsWith("/supplier/submissions")) {
      return "products awaiting review";
    }
    if (scope === "supplier" && href.startsWith("/supplier/products")) {
      return "products needing action";
    }
    if (scope === "supplier" && href.startsWith("/supplier/inventory")) {
      return "stock alerts";
    }
    return "notifications";
  }

  function prefetchHref(href: string) {
    const target = href.split("#")[0] || href;
    if (!target || target === pathname) return;
    router.prefetch(target);
  }

  return (
    <div className="grid gap-5">
      <nav {...{ [dataAttribute]: true }} data-admin-nav className="grid gap-4">
        {groups.map((group) => {
          const isCollapsed = collapsedGroups[group.label] ?? false;
          const hasActiveItem = group.items.some((item) => isActivePath(pathname, item.href));

          return (
          <div key={group.label} className="grid gap-0.5">
            <button
              type="button"
              onClick={() => {
                if (!group.defaultCollapsed) return;
                setCollapsedGroups((current) => ({
                  ...current,
                  [group.label]: !isCollapsed
                }));
              }}
              className={`flex w-full items-center justify-between px-2.5 pb-1.5 text-left type-badge font-semibold uppercase tracking-[0.08em] transition-[color,transform] duration-100 ${
                group.defaultCollapsed ? "text-[var(--platform-text-muted)] hover:text-[var(--platform-text-secondary)]" : "text-[var(--platform-text-muted)]"
              }`}
              aria-expanded={group.defaultCollapsed ? !isCollapsed : true}
            >
              <span>{group.label}</span>
              {group.defaultCollapsed ? (
                <span className="text-[9px] font-medium normal-case tracking-normal text-[var(--platform-text-muted)]">
                  {isCollapsed && !hasActiveItem ? "Show" : "Hide"}
                </span>
              ) : null}
            </button>
            {group.defaultCollapsed && isCollapsed && !hasActiveItem ? null : group.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon ? iconByKey[item.icon] : null;
              const badgeCount = badgeCountForItem(item.href, item.badgeCount ?? 0);
              const pending = (isPending || pendingHref === item.href) && pendingHref === item.href;
              return (
                <Link
                  key={`${group.label}-${item.href}`}
                  href={item.href}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  aria-busy={pending ? "true" : undefined}
                  onMouseEnter={() => prefetchHref(item.href)}
                  onFocus={() => prefetchHref(item.href)}
                  onClick={() => {
                    if (active) return;
                    setPendingHref(item.href);
                    startTransition(() => {
                      /* Keep Link navigation; transition marks pending for immediate UI feedback. */
                    });
                  }}
                  className={`relative flex min-h-9 items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[13px] font-medium transition-[colors,opacity,transform] duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--platform-accent)]/30 active:scale-[0.97] ${
                    active
                      ? "bg-[var(--platform-nav-active-bg)] text-[var(--platform-text-primary)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--platform-accent)_18%,transparent)]"
                      : "text-[var(--platform-text-secondary)] hover:bg-[var(--platform-surface-muted)] hover:text-[var(--platform-text-primary)]"
                  } ${pending ? "opacity-65" : ""}`}
                >
                  {active ? (
                    <span
                      className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-full bg-[var(--platform-accent)]"
                      aria-hidden="true"
                    />
                  ) : null}
                  {Icon ? (
                    <Icon
                      className={`h-4 w-4 shrink-0 ${active ? "text-[var(--platform-accent)]" : "text-[var(--platform-text-muted)]"} ${pending ? "animate-pulse" : ""}`}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="flex-1">{item.label}</span>
                  {pending ? (
                    <span
                      className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--platform-border)] border-t-[var(--platform-accent)]"
                      aria-hidden="true"
                    />
                  ) : badgeCount > 0 ? (
                    <PlatformNavBadge count={badgeCount} label={badgeLabelForItem(item.href)} />
                  ) : null}
                </Link>
              );
            })}
          </div>
        );
        })}
      </nav>
      <form action="/auth/logout" method="post" className="px-1 pb-1">
        <button
          type="submit"
          className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-[13px] font-medium text-[var(--platform-text-secondary)] transition-[colors,transform] duration-100 hover:bg-[var(--platform-surface-muted)] hover:text-[var(--platform-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--platform-accent)]/30 active:scale-[0.97]"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      </form>
    </div>
  );
}
