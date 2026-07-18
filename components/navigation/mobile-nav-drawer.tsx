"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search, UserRound, X } from "lucide-react";
import type { NavigationNode } from "@/config/types";
import type { EnterpriseMenuConfig, EnterpriseMenuOption } from "@/lib/nav-menu-types";
import { isStorefrontGuestOnly } from "@/lib/storefront/guest-demo";

function getEnterpriseMenuSubLinks(menu: EnterpriseMenuConfig): EnterpriseMenuOption[] {
  if (menu.type === "mega") {
    return [...menu.columnOne, ...menu.columnTwo];
  }
  if (menu.type === "franchise") {
    return menu.items;
  }
  return menu.items;
}

export function MobileNavDrawer({
  navigationItems,
  enterpriseMenuConfigs,
  open,
  onClose,
  onSearch,
  onSearchIntent
}: {
  navigationItems: NavigationNode[];
  enterpriseMenuConfigs: EnterpriseMenuConfig[];
  open: boolean;
  onClose: () => void;
  onSearch?: () => void;
  onSearchIntent?: () => void;
}) {
  const enterpriseMenuByLabel = useMemo(
    () => new Map(enterpriseMenuConfigs.map((menu) => [menu.label, menu])),
    [enterpriseMenuConfigs]
  );
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) {
      setExpandedLabels(new Set());
    }
  }, [open]);

  const toggleExpanded = (label: string) => {
    setExpandedLabels((current) => {
      const next = new Set(current);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  return (
    <>
      <button
        aria-label="Close navigation menu"
        className={`adaptive-mobile-menu__backdrop fixed inset-0 z-[var(--z-dropdown)] cursor-default bg-black/45 ${open ? "is-open" : ""}`}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <div
        data-testid="mobile-menu"
        aria-hidden={!open}
        className={`adaptive-mobile-menu fixed inset-x-4 top-[calc(var(--nav-anchor-bottom,var(--store-nav-offset))+8px)] z-[var(--z-dropdown-panel)] max-h-[calc(100dvh-var(--nav-anchor-bottom,var(--store-nav-offset))-16px)] overflow-y-auto rounded-[20px] border p-4 md:top-[calc(var(--nav-anchor-bottom,var(--store-nav-offset))+8px)] ${open ? "is-open" : ""}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="adaptive-mobile-menu__label text-[11px] font-medium uppercase tracking-[0.14em]">Navigation</p>
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            aria-label="Close menu"
            className="adaptive-mobile-menu__control nav-interactive nav-interactive--subtle inline-flex min-h-11 min-w-11 items-center justify-center rounded-full"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <ul className="space-y-1.5">
          {navigationItems.map((item) => {
            const menu = enterpriseMenuByLabel.get(item.label);
            const subLinks = menu ? getEnterpriseMenuSubLinks(menu) : [];
            const isExpanded = expandedLabels.has(item.label);

            return (
              <li key={item.label}>
                {subLinks.length > 0 ? (
                  <div className="adaptive-mobile-menu__accordion">
                    <div className="flex items-stretch gap-1.5">
                      <Link
                        href={item.href}
                        tabIndex={open ? 0 : -1}
                        onClick={onClose}
                        className="adaptive-mobile-menu__link nav-interactive inline-flex min-h-11 min-w-0 flex-1 items-center rounded-2xl border px-4 py-3.5 text-[14px] font-medium tracking-[0.01em]"
                      >
                        {item.label}
                      </Link>
                      <button
                        type="button"
                        tabIndex={open ? 0 : -1}
                        aria-expanded={isExpanded}
                        aria-controls={`mobile-menu-panel-${menu?.key ?? item.label}`}
                        className="adaptive-mobile-menu__control nav-interactive inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-2xl border"
                        onClick={() => toggleExpanded(item.label)}
                      >
                        <ChevronDown
                          className={`size-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                    <div
                      id={`mobile-menu-panel-${menu?.key ?? item.label}`}
                      hidden={!isExpanded}
                      className="adaptive-mobile-menu__accordion-panel"
                    >
                      <ul className="mt-1.5 space-y-1">
                        {subLinks.map((subLink) => (
                          <li key={`${item.label}-${subLink.label}`}>
                            <Link
                              href={subLink.href}
                              tabIndex={open && isExpanded ? 0 : -1}
                              onClick={onClose}
                              className="adaptive-mobile-menu__sublink nav-interactive inline-flex min-h-10 w-full items-center rounded-xl border px-3.5 py-2.5 text-[13px] font-medium tracking-[0.01em]"
                            >
                              {subLink.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    tabIndex={open ? 0 : -1}
                    onClick={onClose}
                    className="adaptive-mobile-menu__link nav-interactive inline-flex min-h-11 w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-[14px] font-medium tracking-[0.01em]"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        {onSearch ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              tabIndex={open ? 0 : -1}
              onFocus={onSearchIntent}
              onPointerDown={onSearchIntent}
              onPointerEnter={onSearchIntent}
              onClick={() => {
                onClose();
                onSearch();
              }}
              className="adaptive-mobile-menu__action nav-interactive inline-flex h-11 items-center justify-center rounded-full border"
              aria-label="Search"
            >
              <Search className="size-[18px]" />
            </button>
            {!isStorefrontGuestOnly() ? (
              <Link
                href="/account"
                tabIndex={open ? 0 : -1}
                onClick={onClose}
                className="adaptive-mobile-menu__action nav-interactive inline-flex h-11 items-center justify-center rounded-full border"
                aria-label="Account"
              >
                <UserRound className="size-[18px]" />
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
