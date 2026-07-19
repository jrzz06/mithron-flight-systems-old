"use client";

import { FormField, Input, Textarea } from "@/components/platform/form-field";
import { StatusPill } from "@/components/platform/status-pill";
import { cn } from "@/lib/utils";

export function cmsInputClass() {
  return "h-10 w-full rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none transition placeholder:text-[var(--platform-text-muted)] focus:border-[var(--platform-accent)]/35 focus:ring-2 focus:ring-[var(--platform-accent)]/10";
}

function cmsTextareaClass() {
  return "min-h-[96px] w-full rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-sm leading-6 text-[var(--platform-text-primary)] outline-none transition placeholder:text-[var(--platform-text-muted)] focus:border-[var(--platform-accent)]/35 focus:ring-2 focus:ring-[var(--platform-accent)]/10";
}

export function CmsField({
  label,
  name,
  defaultValue,
  placeholder,
  hint,
  type = "text",
  error,
  onChange
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  type?: string;
  error?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <FormField label={label} htmlFor={name} hint={error ?? hint}>
      <Input
        id={name}
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        onChange={onChange}
      />
    </FormField>
  );
}

export function CmsTextAreaField({
  label,
  name,
  defaultValue,
  hint,
  error,
  onChange
}: {
  label: string;
  name: string;
  defaultValue?: string;
  hint?: string;
  error?: string;
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
}) {
  return (
    <FormField label={label} htmlFor={name} hint={error ?? hint}>
      <Textarea id={name} name={name} defaultValue={defaultValue} onChange={onChange} />
    </FormField>
  );
}

export function CmsSelectField({
  label,
  name,
  defaultValue,
  hint,
  options
}: {
  label: string;
  name: string;
  defaultValue?: string;
  hint?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <FormField label={label} htmlFor={name} hint={hint}>
      <select id={name} name={name} defaultValue={defaultValue} className={cmsInputClass()}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}

export function CmsStatusPill({ status }: { status: string }) {
  return <StatusPill status={status} />;
}

function CmsSectionCard({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mithron-elevated-card rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4",
        className
      )}
    >
      {children}
    </div>
  );
}

export function cmsPrimaryButtonClass() {
  return "platform-btn-primary platform-btn-sm";
}

export function cmsSecondaryButtonClass() {
  return "platform-btn-secondary platform-btn-sm";
}
