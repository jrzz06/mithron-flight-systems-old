import type { SlotAssignmentSource } from "@/lib/cms/homepage-slot-assignment";
import { cn } from "@/lib/utils";

const LABELS: Record<SlotAssignmentSource, string | null> = {
  pinned: null,
  inferred: "Auto-selected",
  missing: "Not assigned"
};

const TITLES: Record<SlotAssignmentSource, string | undefined> = {
  pinned: undefined,
  inferred: "System picked this in-stock item automatically. Clear to choose manually.",
  missing: "No product is assigned to this position. Use the dropdown to pick one."
};

export function CmsAssignmentSourceBadge({
  source,
  className
}: {
  source: SlotAssignmentSource;
  className?: string;
}) {
  const label = LABELS[source];
  if (!label) return null;

  return (
    <span
      title={TITLES[source]}
      className={cn(
        "rounded-full px-2 py-0.5 type-badge font-semibold uppercase tracking-wide",
        source === "inferred" && "bg-amber-100 text-amber-900",
        source === "missing" && "bg-[var(--platform-surface-muted)] text-[var(--platform-text-secondary)] border border-[var(--platform-border)]",
        className
      )}
    >
      {label}
    </span>
  );
}
