"use client";

import { useMemo, type ReactNode } from "react";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { wrapServerAction } from "@/hooks/use-async-action";

const panelClass =
  "grid gap-2 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4";
const inputClass =
  "rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 text-sm";
const primaryButtonClass = "platform-btn-primary h-9 w-full rounded-[8px] px-3 text-xs font-medium";
const secondaryButtonClass =
  "h-9 w-full rounded-[8px] border border-[var(--platform-border)] px-3 text-xs font-medium";
const dangerButtonClass =
  "h-9 w-full rounded-[8px] border border-rose-500/40 px-3 text-xs font-medium text-rose-200";

type OperationalPrimaryActionProps = {
  title?: string;
  description?: string;
  action: (formData: FormData) => Promise<void>;
  buttonLabel: string;
  pendingLabel: string;
  children?: ReactNode;
  variant?: "primary" | "secondary";
};

export function OperationalPrimaryAction({
  title = "Next step",
  description,
  action,
  buttonLabel,
  pendingLabel,
  children,
  variant = "primary"
}: OperationalPrimaryActionProps) {
  const timedAction = useMemo(
    () => wrapServerAction(action, { label: pendingLabel || buttonLabel }),
    [action, pendingLabel, buttonLabel]
  );

  return (
    <form action={timedAction} data-primary-action className={panelClass}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
          {title}
        </p>
        {description ? (
          <p className="mt-1 text-sm text-[var(--platform-text-secondary)]">{description}</p>
        ) : null}
      </div>
      {children}
      <OperationalSubmitButton
        pendingLabel={pendingLabel}
        className={variant === "primary" ? primaryButtonClass : secondaryButtonClass}
      >
        {buttonLabel}
      </OperationalSubmitButton>
    </form>
  );
}

type OperationalMoreActionsProps = {
  children: ReactNode;
};

export function OperationalMoreActions({ children }: OperationalMoreActionsProps) {
  return (
    <details data-more-actions className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)]">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-[var(--platform-text-secondary)] marker:content-none [&::-webkit-details-marker]:hidden">
        More actions
      </summary>
      <div className="grid gap-3 border-t border-[var(--platform-border)] px-4 py-4">{children}</div>
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
  children
}: {
  action: (formData: FormData) => Promise<void>;
  buttonLabel: string;
  pendingLabel: string;
  children?: ReactNode;
}) {
  const timedAction = useMemo(
    () => wrapServerAction(action, { label: pendingLabel || buttonLabel }),
    [action, pendingLabel, buttonLabel]
  );

  return (
    <form action={timedAction} className="grid gap-2">
      {children}
      <OperationalSubmitButton pendingLabel={pendingLabel} className={dangerButtonClass}>
        {buttonLabel}
      </OperationalSubmitButton>
    </form>
  );
}

export function OperationalSecondaryAction({
  action,
  buttonLabel,
  pendingLabel,
  children
}: {
  action: (formData: FormData) => Promise<void>;
  buttonLabel: string;
  pendingLabel: string;
  children?: ReactNode;
}) {
  const timedAction = useMemo(
    () => wrapServerAction(action, { label: pendingLabel || buttonLabel }),
    [action, pendingLabel, buttonLabel]
  );

  return (
    <form action={timedAction} className="grid gap-2">
      {children}
      <OperationalSubmitButton pendingLabel={pendingLabel} className={secondaryButtonClass}>
        {buttonLabel}
      </OperationalSubmitButton>
    </form>
  );
}
