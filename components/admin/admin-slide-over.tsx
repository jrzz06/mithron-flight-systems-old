"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getControlPlaneThemeAttrs } from "@/lib/control-plane-theme";

type AdminSlideOverProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  align?: "center" | "right";
  widthClass?: string;
  children: ReactNode;
  dataAttribute?: string;
};

export function AdminSlideOver({
  open,
  onClose,
  title,
  align = "right",
  widthClass = "w-full max-w-2xl",
  children,
  dataAttribute = "data-admin-slide-over"
}: AdminSlideOverProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const { theme, scope } = getControlPlaneThemeAttrs();

  return createPortal(
    <div
      {...{ [dataAttribute]: true }}
      data-control-plane-theme={theme}
      {...(scope ? { "data-control-plane-scope": scope } : {})}
      className={`fixed inset-0 z-[140] flex bg-[#02040a]/72 p-3 backdrop-blur-sm ${
        align === "right" ? "items-stretch justify-end" : "items-center justify-center"
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-full flex-col overflow-hidden rounded-xl border border-[var(--platform-border)] bg-[var(--platform-surface)] shadow-2xl ${widthClass}`}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Panel"}
      >
        {title ? (
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--platform-border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--platform-text-primary)]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--platform-border)] text-[var(--platform-text-secondary)] hover:bg-[var(--platform-surface-muted)]"
            >
              ×
            </button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
