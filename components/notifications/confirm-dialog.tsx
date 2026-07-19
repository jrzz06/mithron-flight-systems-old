"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  /** When set, confirm stays disabled until the operator types this exact text. */
  requireTypedText?: string;
  typedTextLabel?: string;
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
  requireTypedText,
  typedTextLabel,
  onClose,
  onConfirm
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const typedInputId = useId();
  const [typedValue, setTypedValue] = useState("");

  useEffect(() => {
    if (!open) setTypedValue("");
  }, [open]);

  if (!open) return null;

  const typedRequired = Boolean(requireTypedText?.trim());
  const typedMatches = !typedRequired || typedValue === requireTypedText;
  const hintLabel =
    typedTextLabel?.trim() ||
    (requireTypedText ? `Type ${requireTypedText} to confirm` : undefined);

  return (
    <div className="fixed inset-0 z-[var(--z-toast,1400)] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/35 confirm-dialog-backdrop"
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
          "border-[var(--platform-border)] bg-[var(--platform-surface-raised)] text-[var(--platform-text-primary)]",
          "confirm-dialog-panel"
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
          {typedRequired ? (
            <div className="mt-3 grid gap-1.5">
              <label htmlFor={typedInputId} className="text-xs text-[var(--platform-text-secondary)]">
                {hintLabel}
              </label>
              <input
                id={typedInputId}
                type="text"
                autoComplete="off"
                autoFocus
                value={typedValue}
                onChange={(event) => setTypedValue(event.target.value)}
                placeholder={requireTypedText}
                className="h-10 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--platform-accent)]/50"
              />
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--platform-border)] p-3">
          <button type="button" className="platform-btn-ghost platform-btn-sm min-h-11" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!typedMatches}
            className={cn(
              variant === "danger" ? "platform-btn-danger" : "platform-btn-primary",
              "platform-btn-sm min-h-11 disabled:cursor-not-allowed disabled:opacity-50"
            )}
            onClick={() => {
              if (!typedMatches) return;
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
