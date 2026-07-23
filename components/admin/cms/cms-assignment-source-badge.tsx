import type { SlotAssignmentSource } from "@/lib/cms/homepage-slot-assignment";
import { cn } from "@/lib/utils";

const LABELS: Record<SlotAssignmentSource, string | null> = {
  pinned: null,
  inferred: "Auto-selected",
  missing: "Missing"
};

const TITLES: Record<SlotAssignmentSource, string | undefined> = {
  pinned: undefined,
  inferred: "System picked this in-stock item automatically. Clear to choose manually.",
  missing: "This product is missing or unpublished. Clear and pick another."
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
        source === "missing" && "bg-red-100 text-red-800",
        className
      )}
    >
      {label}
    </span>
  );
}
