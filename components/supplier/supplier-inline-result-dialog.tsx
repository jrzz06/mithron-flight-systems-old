"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { PlatformActionBar, PlatformActionGroup } from "@/components/platform/action-bar";

export function SupplierInlineResultDialog({
  open,
  status,
  title,
  message,
  primaryLabel = "OK",
  secondaryLabel,
  onPrimary,
  onSecondary
}: {
  open: boolean;
  status: "success" | "error";
  title: string;
  message: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
}) {
  if (!open) return null;

  const isSuccess = status === "success";

  return (
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-black/60 p-4"
      role="presentation"
      onClick={onPrimary}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-inline-result-title"
        aria-describedby="supplier-inline-result-message"
        data-supplier-inline-result-dialog
        className="w-full max-w-md rounded-[var(--platform-radius)] border border-[var(--platform-border-strong)] bg-[var(--platform-surface-raised)] p-6 shadow-[var(--platform-shadow-md)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {isSuccess ? (
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[var(--platform-success)]" aria-hidden="true" />
          ) : (
            <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-[var(--platform-danger)]" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <h2 id="supplier-inline-result-title" className="platform-type-section-title text-base">
              {title}
            </h2>
            <p id="supplier-inline-result-message" className="platform-type-body mt-2">
              {message}
            </p>
          </div>
        </div>
        <PlatformActionBar className="mt-6">
          <PlatformActionGroup>
            {secondaryLabel && onSecondary ? (
              <button type="button" onClick={onSecondary} className="platform-btn-secondary platform-btn-md">
                {secondaryLabel}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onPrimary}
              className={isSuccess ? "platform-btn-primary platform-btn-md" : "platform-btn-danger platform-btn-md"}
            >
              {primaryLabel}
            </button>
          </PlatformActionGroup>
        </PlatformActionBar>
      </div>
    </div>
  );
}
