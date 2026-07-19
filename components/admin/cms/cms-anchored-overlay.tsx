"use client";

import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const OVERLAY_Z = 100;
const MAX_HEIGHT_PX = 240;

type Rect = { top: number; left: number; width: number; bottom: number };

function readAnchorRect(anchor: HTMLElement | null): Rect | null {
  if (!anchor) return null;
  const box = anchor.getBoundingClientRect();
  return { top: box.top, left: box.left, width: box.width, bottom: box.bottom };
}

/**
 * Portal floating panel anchored under an input/button.
 * Escapes overflow/isolation stacking contexts that clip absolute dropdowns.
 */
export function CmsAnchoredOverlay({
  open,
  anchorRef,
  onClose,
  children,
  className,
  id,
  role = "listbox"
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  id?: string;
  role?: string;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);

  const updatePosition = useCallback(() => {
    setRect(readAnchorRect(anchorRef.current));
  }, [anchorRef]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => updatePosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open || !onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!mounted || !open || !rect || typeof document === "undefined") return null;

  const spaceBelow = window.innerHeight - rect.bottom;
  const openUpward = spaceBelow < Math.min(MAX_HEIGHT_PX, 160) && rect.top > spaceBelow;
  const style = openUpward
    ? {
        position: "fixed" as const,
        left: rect.left,
        width: Math.max(rect.width, 200),
        bottom: window.innerHeight - rect.top + 4,
        maxHeight: MAX_HEIGHT_PX,
        zIndex: OVERLAY_Z
      }
    : {
        position: "fixed" as const,
        left: rect.left,
        width: Math.max(rect.width, 200),
        top: rect.bottom + 4,
        maxHeight: MAX_HEIGHT_PX,
        zIndex: OVERLAY_Z
      };

  return createPortal(
    <div
      id={id}
      role={role}
      data-cms-anchored-overlay
      className={cn(
        "overflow-y-auto rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-1 shadow-lg",
        className
      )}
      style={style}
    >
      {children}
    </div>,
    document.body
  );
}
