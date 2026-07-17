import { cn } from "@/lib/utils";

type AccountFieldProps = {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
};

export function AccountField({ label, htmlFor, hint, children, className }: AccountFieldProps) {
  return (
    <label htmlFor={htmlFor} className={cn("grid gap-2 text-sm", className)}>
      <span className="font-medium text-[var(--account-ink)]">{label}</span>
      {children}
      {hint ? <span className="text-xs text-[var(--account-ink-muted)]">{hint}</span> : null}
    </label>
  );
}

type AccountInputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function AccountInput({ className, ...props }: AccountInputProps) {
  return (
    <input
      className={cn(
        "min-h-11 rounded-xl border border-[var(--account-border-strong)] bg-[var(--account-surface)] px-4 py-2.5 text-[var(--account-ink)] placeholder:text-[var(--account-ink-muted)]",
        "disabled:cursor-not-allowed disabled:bg-[var(--account-surface-muted)] disabled:text-[var(--account-ink-muted)]",
        className
      )}
      {...props}
    />
  );
}

type AccountTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function AccountTextarea({ className, ...props }: AccountTextareaProps) {
  return (
    <textarea
      className={cn(
        "min-h-24 rounded-xl border border-[var(--account-border-strong)] bg-[var(--account-surface)] px-4 py-2.5 text-[var(--account-ink)] placeholder:text-[var(--account-ink-muted)]",
        className
      )}
      {...props}
    />
  );
}
