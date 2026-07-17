import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";

type AccountEmptyStateProps = {
  children: React.ReactNode;
  className?: string;
};

export function AccountEmptyState({ children, className }: AccountEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--account-radius-card)] border border-dashed border-[var(--account-border-strong)] bg-[var(--account-surface)] px-6 py-12 text-center",
        className
      )}
    >
      <div className="mb-4 flex items-center justify-center gap-1.5 text-[var(--account-border-strong)]">
        <Circle className="size-1.5 fill-current" />
        <Circle className="size-2 fill-current" />
        <Circle className="size-1.5 fill-current" />
      </div>
      <div className="max-w-[280px] text-sm leading-relaxed text-[var(--account-ink-muted)]">
        {children}
      </div>
    </div>
  );
}
