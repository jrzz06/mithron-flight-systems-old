"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onClose,
  onConfirm
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-toast,1400)] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          "relative w-full max-w-[520px] overflow-hidden rounded-t-[16px] border shadow-[0_18px_60px_rgba(0,0,0,0.22)] sm:rounded-[12px]",
          "border-[var(--platform-border)] bg-[var(--platform-surface-raised)] text-[var(--platform-text-primary)]"
        )}
      >
        <div className="p-4">
          <p id={titleId} className="text-sm font-medium tracking-[-0.01em]">
            {title}
          </p>
          {description ? (
            <p id={descId} className="mt-1 text-xs leading-5 text-[var(--platform-text-muted)]">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--platform-border)] p-3">
          <button type="button" className="platform-btn-ghost platform-btn-sm min-h-11" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={cn(
              variant === "danger" ? "platform-btn-danger" : "platform-btn-primary",
              "platform-btn-sm min-h-11"
            )}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

