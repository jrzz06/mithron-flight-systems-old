import type { ReactNode } from "react";
import { EmptyState } from "@/components/platform/empty-state";

type DataTableProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  emptyLabel?: string;
  isEmpty?: boolean;
  className?: string;
};

export function DataTable({
  title,
  description,
  action,
  children,
  emptyLabel = "No records to display.",
  isEmpty = false,
  className = ""
}: DataTableProps) {
  return (
    <section
      className={`mithron-elevated-card overflow-hidden rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] ${className}`}
    >
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-4 py-3">
          <div>
            <h3 className="text-sm font-medium text-[var(--platform-text-primary)]">{title}</h3>
            {description ? <p className="mt-0.5 text-xs text-[var(--platform-text-muted)]">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        {isEmpty ? (
          <div className="p-6">
            <EmptyState message={emptyLabel} />
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
