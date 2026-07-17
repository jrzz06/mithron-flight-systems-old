"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type PromptDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
};

export function PromptDialog({
  open,
  title,
  description,
  placeholder,
  initialValue,
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  onClose,
  onConfirm
}: PromptDialogProps) {
  const titleId = useId();
  const descId = useId();
  const [value, setValue] = useState(initialValue ?? "");
  const resolvedOpen = Boolean(open);

  useEffect(() => {
    if (!resolvedOpen) return;
    setValue(initialValue ?? "");
  }, [initialValue, resolvedOpen]);

  const describedBy = useMemo(() => (description ? descId : undefined), [descId, description]);

  if (!resolvedOpen) return null;

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
        aria-describedby={describedBy}
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
          <input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            className={cn(
              "mt-3 h-11 w-full rounded-[10px] border px-3 text-sm outline-none",
              "border-[var(--platform-border-strong)] bg-[var(--platform-surface)] text-[var(--platform-text-primary)]",
              "focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
            )}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "Enter") onConfirm(value);
            }}
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--platform-border)] p-3">
          <button type="button" className="platform-btn-ghost platform-btn-sm min-h-11" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="platform-btn-primary platform-btn-sm min-h-11"
            onClick={() => onConfirm(value)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

