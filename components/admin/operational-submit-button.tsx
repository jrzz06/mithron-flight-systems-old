"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ConfirmDialog } from "@/components/notifications/confirm-dialog";
import { useOptionalGlobalBusy } from "@/components/ui/global-busy";

export function OperationalSubmitButton({
  children,
  pendingLabel = "Saving",
  className = "platform-btn-primary platform-btn-md",
  confirmMessage,
  confirmDescription,
  confirmLabel = "Confirm",
  requireTypedText,
  typedTextLabel,
  onClick,
  name,
  value,
  disabled = false,
  formAction,
  busy
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  confirmMessage?: string;
  /** Optional longer body when title is short; overrides auto-split of confirmMessage. */
  confirmDescription?: string;
  confirmLabel?: string;
  /** When set, operator must type this exact text before confirm is enabled. */
  requireTypedText?: string;
  typedTextLabel?: string;
  onClick?: () => void;
  name?: string;
  value?: string;
  disabled?: boolean;
  formAction?: (formData: FormData) => void | Promise<void>;
  /**
   * When set, drives the pending label/disabled state instead of useFormStatus.
   * Timed operational forms pass this so the button clears as soon as the server
   * action returns — even if RSC revalidation is still in flight.
   */
  busy?: boolean;
}) {
  const { pending: formPending } = useFormStatus();
  const pending = busy !== undefined ? busy : formPending;
  const busyId = useId();
  const busyCtx = useOptionalGlobalBusy();
  const beginBusy = busyCtx?.beginBusy;
  const endBusy = busyCtx?.endBusy;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [queuedSubmit, setQueuedSubmit] = useState<HTMLButtonElement | null>(null);
  const guardId = `operational-submit:${busyId}`;

  useEffect(() => {
    if (!beginBusy || !endBusy) return;
    if (pending) beginBusy(guardId);
    else endBusy(guardId);
    return () => endBusy(guardId);
  }, [guardId, beginBusy, endBusy, pending]);

  const confirmTitle = useMemo(() => {
    if (!confirmMessage) return "Confirm action";
    const trimmed = confirmMessage.trim();
    return trimmed.length > 60 ? "Confirm action" : trimmed;
  }, [confirmMessage]);

  const resolvedDescription = useMemo(() => {
    if (confirmDescription?.trim()) return confirmDescription.trim();
    if (!confirmMessage) return undefined;
    const trimmed = confirmMessage.trim();
    return confirmTitle === trimmed ? undefined : trimmed;
  }, [confirmDescription, confirmMessage, confirmTitle]);

  const label = pending ? pendingLabel : children;
  const needsConfirm = Boolean(confirmMessage?.trim() || requireTypedText?.trim());

  return (
    <>
      <button
        type="submit"
        name={name}
        value={value}
        formAction={formAction}
        disabled={pending || disabled}
        aria-busy={pending}
        aria-live="polite"
        onClick={(event) => {
          if (pending) {
            event.preventDefault();
            return;
          }
          onClick?.();
          if (needsConfirm) {
            event.preventDefault();
            setQueuedSubmit(event.currentTarget);
            setConfirmOpen(true);
          }
        }}
        className={`${className} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--platform-accent)]/40 disabled:cursor-not-allowed`}
      >
        {label}
      </button>
      {needsConfirm ? (
        <ConfirmDialog
          open={confirmOpen}
          title={confirmTitle}
          description={resolvedDescription}
          confirmLabel={confirmLabel}
          variant="danger"
          requireTypedText={requireTypedText}
          typedTextLabel={typedTextLabel}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            queuedSubmit?.closest("form")?.requestSubmit(queuedSubmit);
          }}
        />
      ) : null}
    </>
  );
}
