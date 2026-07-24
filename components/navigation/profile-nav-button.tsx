"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/client";
import {
  cancelNavPanelSchedule,
  scheduleNavPanelClose,
  scheduleNavPanelOpen,
  useNavPanelStore
} from "@/store/nav-panel";
import { cn } from "@/lib/utils";
import styles from "./nav-popover.module.css";

function canUseHoverIntent() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function ProfileNavButton() {
  const activePanel = useNavPanelStore((s) => s.activePanel);
  const exitingPanel = useNavPanelStore((s) => s.exitingPanel);
  const openPanel = useNavPanelStore((s) => s.openPanel);
  const closePanel = useNavPanelStore((s) => s.closePanel);
  const open = activePanel === "profile";
  const mounted = open || exitingPanel === "profile";
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  // Default guest until auth resolves so Orders / Sign out never flash for guests.
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | null = null;

    try {
      const supabase = createClient();
      void supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!active) return;
          setSignedIn(Boolean(data.session?.user));
        })
        .catch(() => {
          if (active) setSignedIn(false);
        });

      const listener = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        setSignedIn(Boolean(session?.user));
      });
      subscription = listener.data.subscription;
    } catch {
      if (active) setSignedIn(false);
    }

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  const syncAnchor = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = Math.ceil(rect.bottom + 12);
    const right = Math.max(12, Math.ceil(window.innerWidth - rect.right));
    setAnchor({ top, right });
  }, []);

  useEffect(() => {
    if (!mounted) {
      setAnchor(null);
      return;
    }
    syncAnchor();
    window.addEventListener("resize", syncAnchor);
    window.addEventListener("scroll", syncAnchor, { passive: true });
    return () => {
      window.removeEventListener("resize", syncAnchor);
      window.removeEventListener("scroll", syncAnchor);
    };
  }, [mounted, syncAnchor]);

  const toggle = useCallback(() => {
    cancelNavPanelSchedule();
    if (useNavPanelStore.getState().activePanel === "profile") {
      closePanel();
      return;
    }
    syncAnchor();
    openPanel("profile", { source: "click", triggerEl: triggerRef.current });
  }, [closePanel, openPanel, syncAnchor]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls="storefront-profile-popover"
        className="adaptive-navbar__icon nav-interactive nav-interactive--subtle inline-flex size-11 items-center justify-center rounded-full text-current"
        onClick={toggle}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse" || !canUseHoverIntent()) return;
          cancelNavPanelSchedule();
          syncAnchor();
          if (useNavPanelStore.getState().activePanel === "profile") return;
          scheduleNavPanelOpen("profile", {
            source: "hover",
            triggerEl: triggerRef.current
          });
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse" || !canUseHoverIntent()) return;
          if (useNavPanelStore.getState().activePanel === "profile") {
            scheduleNavPanelClose();
          }
        }}
      >
        <UserRound className="size-[18px]" />
      </button>

      {mounted && anchor ? (
        <div
          id="storefront-profile-popover"
          role="menu"
          aria-label="Account"
          aria-hidden={!open}
          className={cn(styles.popover, open && styles.isOpen)}
          style={{ top: anchor.top, right: anchor.right }}
          onPointerEnter={() => cancelNavPanelSchedule()}
          onPointerLeave={(event) => {
            if (event.pointerType !== "mouse" || !canUseHoverIntent()) return;
            scheduleNavPanelClose();
          }}
        >
          <div className={styles.popoverBridge} aria-hidden="true" />
          <div className={styles.popoverPanel}>
            {signedIn ? (
              <>
                <Link
                  href="/account"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => closePanel()}
                >
                  Account
                </Link>
                <Link
                  href="/account/orders"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => closePanel()}
                >
                  Orders
                </Link>
                <form action="/auth/logout" method="post">
                  <button
                    type="submit"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={() => closePanel()}
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/login?next=/account"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => closePanel()}
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
