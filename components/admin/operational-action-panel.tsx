"use client";

import { useCallback, useState, type ReactNode } from "react";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { wrapServerAction } from "@/hooks/use-async-action";
import { notify } from "@/lib/feedback/notify";
import { cn } from "@/lib/utils";

const panelClass =
  "grid gap-2 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4";
const inputClass =
  "rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 text-sm";
const primaryButtonClass = "platform-btn-primary h-9 w-full rounded-[8px] px-3 text-xs font-medium";
const secondaryButtonClass =
  "platform-btn-secondary h-9 w-full rounded-[8px] px-3 text-xs font-medium";
const dangerButtonClass =
  "platform-btn-danger h-9 w-full rounded-[8px] px-3 text-xs font-medium";
const moreActionsSummaryClass =
  "platform-btn-secondary platform-btn-sm cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden";

export type OperationalActionResult = {
  ok?: boolean;
  message?: string;
} | void;

type OperationalFormAction = (formData: FormData) => Promise<OperationalActionResult>;

function notifyActionResult(result: OperationalActionResult) {
  if (!result || typeof result !== "object") return;
  const message = String(result.message ?? "").trim();
  if (!message) return;
  if (result.ok === false) notify.error(message);
  else notify.success(message);
}

/**
 * Wraps a server action with timeout racing and local pending that clears as soon
 * as the action settles — so OperationalSubmitButton does not stay on "Saving"
 * while RSC revalidation is still running.
 */
function useTimedOperationalAction(action: OperationalFormAction, label: string) {
  const [isPending, setIsPending] = useState(false);

  const timedAction = useCallback(
    async (formData: FormData) => {
      setIsPending(true);
      try {
        const run = wrapServerAction(async (data: FormData) => {
          const result = await action(data);
          notifyActionResult(result);
        }, { label });
        await run(formData);
      } finally {
        setIsPending(false);
      }
    },
    [action, label]
  );

  return { timedAction, isPending };
}

type OperationalPrimaryActionProps = {
  title?: string;
  description?: string;
  action: OperationalFormAction;
  buttonLabel: string;
  pendingLabel: string;
  children?: ReactNode;
  variant?: "primary" | "secondary";
  confirmMessage?: string;
  confirmDescription?: string;
  confirmLabel?: string;
  /** Extra classes on the form panel (e.g. compact width in warehouse detail). */
  className?: string;
};

export function OperationalPrimaryAction({
  title = "Next step",
  description,
  action,
  buttonLabel,
  pendingLabel,
  children,
  variant = "primary",
  confirmMessage,
  confirmDescription,
  confirmLabel,
  className = ""
}: OperationalPrimaryActionProps) {
  const { timedAction, isPending } = useTimedOperationalAction(action, pendingLabel || buttonLabel);

  return (
    <form action={timedAction} data-primary-action className={cn(panelClass, className)}>
      <div>
        <p className="type-meta font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
          {title}
        </p>
        {description ? (
          <p className="mt-1 text-sm text-[var(--platform-text-secondary)]">{description}</p>
        ) : null}
      </div>
      {children}
      <OperationalSubmitButton
        busy={isPending}
        pendingLabel={pendingLabel}
        className={variant === "primary" ? primaryButtonClass : secondaryButtonClass}
        confirmMessage={confirmMessage}
        confirmDescription={confirmDescription}
        confirmLabel={confirmLabel}
      >
        {buttonLabel}
      </OperationalSubmitButton>
    </form>
  );
}

type OperationalMoreActionsProps = {
  children: ReactNode;
  summaryLabel?: string;
};

export function OperationalMoreActions({
  children,
  summaryLabel = "More actions"
}: OperationalMoreActionsProps) {
  return (
    <details data-more-actions className="rounded-[8px]">
      <summary className={moreActionsSummaryClass}>{summaryLabel}</summary>
      <div className="mt-2 grid gap-3 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-4 py-4">
        {children}
      </div>
    </details>
  );
}

type OperationalNoteFieldProps = {
  name?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
};

export function OperationalNoteField({
  name = "note",
  placeholder = "Notes (optional)",
  rows = 2,
  required = false
}: OperationalNoteFieldProps) {
  return (
    <textarea
      name={name}
      rows={rows}
      required={required}
      placeholder={placeholder}
      className={inputClass}
    />
  );
}

type OperationalTextFieldProps = {
  name: string;
  placeholder: string;
  required?: boolean;
  className?: string;
};

export function OperationalTextField({
  name,
  placeholder,
  required = false,
  className = ""
}: OperationalTextFieldProps) {
  return (
    <input
      name={name}
      required={required}
      placeholder={placeholder}
      className={`${inputClass} h-9 ${className}`}
    />
  );
}

export function OperationalDangerAction({
  action,
  buttonLabel,
  pendingLabel,
  children,
  confirmMessage,
  confirmDescription,
  requireTypedText,
  typedTextLabel,
  confirmLabel
}: {
  action: OperationalFormAction;
  buttonLabel: string;
  pendingLabel: string;
  children?: ReactNode;
  confirmMessage?: string;
  confirmDescription?: string;
  requireTypedText?: string;
  typedTextLabel?: string;
  confirmLabel?: string;
}) {
  const { timedAction, isPending } = useTimedOperationalAction(action, pendingLabel || buttonLabel);

  return (
    <form action={timedAction} className="grid gap-2">
      {children}
      <OperationalSubmitButton
        busy={isPending}
        pendingLabel={pendingLabel}
        className={dangerButtonClass}
        confirmMessage={confirmMessage}
        confirmDescription={confirmDescription}
        requireTypedText={requireTypedText}
        typedTextLabel={typedTextLabel}
        confirmLabel={confirmLabel}
      >
        {buttonLabel}
      </OperationalSubmitButton>
    </form>
  );
}

export function OperationalSecondaryAction({
  action,
  buttonLabel,
  pendingLabel,
  children,
  confirmMessage,
  confirmDescription,
  confirmLabel
}: {
  action: OperationalFormAction;
  buttonLabel: string;
  pendingLabel: string;
  children?: ReactNode;
  confirmMessage?: string;
  confirmDescription?: string;
  confirmLabel?: string;
}) {
  const { timedAction, isPending } = useTimedOperationalAction(action, pendingLabel || buttonLabel);

  return (
    <form action={timedAction} className="grid gap-2">
      {children}
      <OperationalSubmitButton
        busy={isPending}
        pendingLabel={pendingLabel}
        className={secondaryButtonClass}
        confirmMessage={confirmMessage}
        confirmDescription={confirmDescription}
        confirmLabel={confirmLabel}
      >
        {buttonLabel}
      </OperationalSubmitButton>
    </form>
  );
}
