"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type TouchEvent as ReactTouchEvent } from "react";
import { ChevronDown, Search, UserRound, X } from "@/components/icons/storefront-icons";
import { MithronBrandMark } from "@/components/brand/mithron-brand-mark";
import type { NavigationNode } from "@/config/types";
import type { EnterpriseMenuConfig, EnterpriseMenuOption } from "@/lib/nav-menu-types";
import { isStorefrontGuestOnly } from "@/lib/storefront/guest-demo";

/** Match CSS drawer transition duration for gesture snap-back. */
const DRAWER_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const SWIPE_CLOSE_PX = 72;

function getEnterpriseMenuSubLinks(menu: EnterpriseMenuConfig): EnterpriseMenuOption[] {
  if (menu.type === "mega") {
    return menu.columnOne;
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
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [entered, setEntered] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const dragAxis = useRef<"x" | "y" | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      setExpandedLabels(new Set());
      setDragOffset(0);
      setIsDragging(false);
      touchStartX.current = null;
      touchStartY.current = null;
      dragAxis.current = null;
      return;
    }

    // Double rAF so the closed transform paints before the open transition.
    let frameTwo = 0;
    const frameOne = window.requestAnimationFrame(() => {
      frameTwo = window.requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      window.cancelAnimationFrame(frameOne);
      window.cancelAnimationFrame(frameTwo);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    }, 40);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open, onClose]);

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

  const onTouchStart = useCallback((event: ReactTouchEvent) => {
    if (!open) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    dragAxis.current = null;
    setIsDragging(true);
  }, [open]);

  const onTouchMove = useCallback((event: ReactTouchEvent) => {
    if (touchStartX.current == null || touchStartY.current == null) return;
    const touch = event.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;

    if (dragAxis.current == null) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return;
      dragAxis.current = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
      if (dragAxis.current === "y") {
        setIsDragging(false);
        return;
      }
    }

    if (dragAxis.current !== "x") return;
    // Only allow swipe-to-close (left).
    setDragOffset(Math.min(0, deltaX));
  }, []);

  const onTouchEnd = useCallback(() => {
    const shouldClose = dragOffset <= -SWIPE_CLOSE_PX;
    setIsDragging(false);
    touchStartX.current = null;
    touchStartY.current = null;
    dragAxis.current = null;

    if (shouldClose) {
      setDragOffset(0);
      onClose();
      return;
    }
    setDragOffset(0);
  }, [dragOffset, onClose]);

  const panelStyle = useMemo(() => {
    if (!entered) return undefined;
    if (dragOffset === 0 && !isDragging) return undefined;
    return {
      transform: `translate3d(${dragOffset}px, 0, 0)`,
      transition: isDragging ? "none" : `transform 340ms ${DRAWER_EASE}`
    } as CSSProperties;
  }, [entered, dragOffset, isDragging]);

  const backdropStyle = useMemo(() => {
    if (!entered || dragOffset === 0) return undefined;
    const progress = Math.max(0, 1 + dragOffset / 280);
    return { opacity: progress } as CSSProperties;
  }, [entered, dragOffset]);

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation menu"
        className={`adaptive-mobile-menu__backdrop ${entered ? "is-open" : ""}`}
        tabIndex={open ? 0 : -1}
        style={backdropStyle}
        onClick={onClose}
      />
      <nav
        data-testid="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        aria-hidden={!open}
        className={`adaptive-mobile-menu ${entered ? "is-open" : ""}`}
        style={panelStyle}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <header className="adaptive-mobile-menu__header">
          <div className="adaptive-mobile-menu__header-inner">
            <Link
              href="/"
              aria-label="Go to Mithron home"
              tabIndex={open ? 0 : -1}
              onClick={onClose}
              className="adaptive-mobile-menu__brand nav-interactive inline-flex shrink-0 items-center"
            >
              <MithronBrandMark />
              <span className="sr-only">Mithron</span>
            </Link>

            <div className="adaptive-mobile-menu__header-actions">
              {onSearch ? (
                <button
                  type="button"
                  tabIndex={open ? 0 : -1}
                  aria-label="Search"
                  className="adaptive-mobile-menu__icon nav-interactive nav-interactive--subtle"
                  onFocus={onSearchIntent}
                  onPointerDown={onSearchIntent}
                  onPointerEnter={onSearchIntent}
                  onClick={() => {
                    onClose();
                    onSearch();
                  }}
                >
                  <Search className="size-[18px]" />
                </button>
              ) : null}
              <button
                ref={closeButtonRef}
                type="button"
                tabIndex={open ? 0 : -1}
                aria-label="Close menu"
                className="adaptive-mobile-menu__icon nav-interactive nav-interactive--subtle"
                onClick={onClose}
              >
                <X className="size-[18px]" />
              </button>
            </div>
          </div>
        </header>

        <div className="adaptive-mobile-menu__body">
          <ul className="adaptive-mobile-menu__list">
            {navigationItems.map((item) => {
              const menu = enterpriseMenuByLabel.get(item.label);
              const subLinks = menu ? getEnterpriseMenuSubLinks(menu) : [];
              const isExpanded = expandedLabels.has(item.label);

              return (
                <li key={item.label} className="adaptive-mobile-menu__item">
                  {subLinks.length > 0 ? (
                    <div className="adaptive-mobile-menu__accordion">
                      <div className="adaptive-mobile-menu__row">
                        <Link
                          href={item.href}
                          tabIndex={open ? 0 : -1}
                          onClick={onClose}
                          className="adaptive-mobile-menu__link nav-interactive"
                        >
                          {item.label}
                        </Link>
                        <button
                          type="button"
                          tabIndex={open ? 0 : -1}
                          aria-expanded={isExpanded}
                          aria-controls={`mobile-menu-panel-${menu?.key ?? item.label}`}
                          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.label}`}
                          className="adaptive-mobile-menu__chevron nav-interactive"
                          onClick={() => toggleExpanded(item.label)}
                        >
                          <ChevronDown
                            className={`size-4 transition-transform duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${isExpanded ? "rotate-180" : ""}`}
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                      <div
                        id={`mobile-menu-panel-${menu?.key ?? item.label}`}
                        hidden={!isExpanded}
                        className="adaptive-mobile-menu__accordion-panel"
                      >
                        <ul className="adaptive-mobile-menu__sublist">
                          {subLinks.map((subLink) => (
                            <li key={`${item.label}-${subLink.label}`}>
                              <Link
                                href={subLink.href}
                                tabIndex={open && isExpanded ? 0 : -1}
                                onClick={onClose}
                                className="adaptive-mobile-menu__sublink nav-interactive"
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
                      className="adaptive-mobile-menu__link nav-interactive"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              );
            })}

            {!isStorefrontGuestOnly() ? (
              <li className="adaptive-mobile-menu__item">
                <Link
                  href="/account"
                  tabIndex={open ? 0 : -1}
                  onClick={onClose}
                  className="adaptive-mobile-menu__link adaptive-mobile-menu__link--action nav-interactive"
                  aria-label="Account"
                >
                  <UserRound className="size-[18px]" aria-hidden="true" />
                  <span>Account</span>
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      </nav>
    </>
  );
}
