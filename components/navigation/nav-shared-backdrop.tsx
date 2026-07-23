"use client";

import { useEffect } from "react";
import { useNavPanelStore } from "@/store/nav-panel";
import styles from "./nav-shared-backdrop.module.css";
import { cn } from "@/lib/utils";

/**
 * Single shared dim + blur backdrop for every nav panel.
 * Click / ESC closes the active panel.
 */
export function NavSharedBackdrop() {
  const activePanel = useNavPanelStore((s) => s.activePanel);
  const closePanel = useNavPanelStore((s) => s.closePanel);
  const open = activePanel !== null;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closePanel]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <button
      type="button"
      tabIndex={open ? 0 : -1}
      aria-label="Dismiss navigation panel"
      className={cn(styles.backdrop, open && styles.isOpen)}
      onClick={closePanel}
    />
  );
}
