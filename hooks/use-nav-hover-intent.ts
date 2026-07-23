"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  cancelNavPanelSchedule,
  scheduleNavPanelClose,
  scheduleNavPanelOpen,
  useNavPanelStore,
  type NavPanel,
  type NavPanelOpenSource
} from "@/store/nav-panel";

function canUseHoverIntent() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

type UseNavHoverIntentOptions = {
  panel: Exclude<NavPanel, null>;
  categoryKey?: string;
  /** When true, leave does not schedule close (e.g. search stays until click-outside). */
  stickyOpen?: boolean;
};

/**
 * Desktop hover-intent bindings for nav triggers.
 * Open delay 60ms / close delay 200ms. Cancel close on re-enter.
 */
export function useNavHoverIntent({ panel, categoryKey, stickyOpen = false }: UseNavHoverIntentOptions) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const activePanel = useNavPanelStore((s) => s.activePanel);

  const openNow = useCallback(
    (source: NavPanelOpenSource = "click") => {
      cancelNavPanelSchedule();
      useNavPanelStore.getState().openPanel(panel, {
        categoryKey,
        source,
        triggerEl: triggerRef.current
      });
    },
    [panel, categoryKey]
  );

  const toggle = useCallback(() => {
    cancelNavPanelSchedule();
    const current = useNavPanelStore.getState().activePanel;
    if (current === panel) {
      useNavPanelStore.getState().closePanel();
      return;
    }
    openNow("click");
  }, [openNow, panel]);

  const onPointerEnter = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== "mouse" || !canUseHoverIntent()) return;
      triggerRef.current = event.currentTarget as HTMLElement;
      cancelNavPanelSchedule();
      if (useNavPanelStore.getState().activePanel === panel) {
        if (panel === "category" && categoryKey) {
          useNavPanelStore.getState().setCategoryKey(categoryKey);
        }
        return;
      }
      scheduleNavPanelOpen(panel, {
        categoryKey,
        source: "hover",
        triggerEl: event.currentTarget as HTMLElement
      });
    },
    [panel, categoryKey]
  );

  const onPointerLeave = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== "mouse" || !canUseHoverIntent()) return;
      if (stickyOpen) return;
      // Only schedule close if this panel is active (or about to open).
      const current = useNavPanelStore.getState().activePanel;
      if (current && current !== panel) return;
      scheduleNavPanelClose();
    },
    [panel, stickyOpen]
  );

  const onPanelPointerEnter = useCallback(() => {
    if (!canUseHoverIntent()) return;
    cancelNavPanelSchedule();
  }, []);

  const onPanelPointerLeave = useCallback(() => {
    if (!canUseHoverIntent() || stickyOpen) return;
    if (useNavPanelStore.getState().activePanel !== panel) return;
    scheduleNavPanelClose();
  }, [panel, stickyOpen]);

  useEffect(() => {
    return () => {
      cancelNavPanelSchedule();
    };
  }, []);

  return {
    triggerRef,
    isOpen: activePanel === panel,
    openNow,
    toggle,
    onPointerEnter,
    onPointerLeave,
    onPanelPointerEnter,
    onPanelPointerLeave,
    setTriggerEl: (el: HTMLElement | null) => {
      triggerRef.current = el;
    }
  };
}
