import { cn } from "@/lib/utils";

type ChipTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<ChipTone, string> = {
  neutral: "border-[var(--account-border-strong)] bg-[var(--account-surface-muted)] text-[var(--account-ink)]",
  success: "border-[color-mix(in_srgb,var(--account-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--account-success)_10%,white)] text-[var(--account-success)]",
  warning: "border-[color-mix(in_srgb,var(--account-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--account-warning)_10%,white)] text-[var(--account-warning)]",
  danger: "border-[color-mix(in_srgb,var(--account-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--account-danger)_8%,white)] text-[var(--account-danger)]",
  info: "border-[color-mix(in_srgb,var(--account-accent)_30%,transparent)] bg-[var(--account-accent-soft)] text-[var(--account-accent)]"
};

const dotClasses: Record<ChipTone, string> = {
  neutral: "bg-[var(--account-ink-muted)]",
  success: "bg-[var(--account-success)]",
  warning: "bg-[var(--account-warning)]",
  danger: "bg-[var(--account-danger)]",
  info: "bg-[var(--account-accent)]"
};

function toneForStatus(status: string): ChipTone {
  const normalized = status.toLowerCase();
  if (["delivered", "paid", "succeeded", "converted", "won", "confirmed"].includes(normalized)) return "success";
  if (["cancelled", "failed", "refunded", "lost"].includes(normalized)) return "danger";
  if (["pending_payment", "requires_payment", "admin_review", "new", "processing", "pending"].includes(normalized)) {
    return "warning";
  }
  if (["shipped", "dispatched", "in_transit", "contacted", "qualified"].includes(normalized)) return "info";
  return "neutral";
}

type AccountStatusChipProps = {
  label: string;
  status?: string;
  tone?: ChipTone;
  className?: string;
};

export function AccountStatusChip({ label, status, tone, className }: AccountStatusChipProps) {
  const resolvedTone = tone ?? toneForStatus(status ?? label);

  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none tracking-tight",
        toneClasses[resolvedTone],
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", dotClasses[resolvedTone])} aria-hidden />
      {label}
    </span>
  );
}
