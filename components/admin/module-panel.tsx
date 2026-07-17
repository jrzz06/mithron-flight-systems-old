import Image from "next/image";
import { MetricGrid, Card } from "@/components/platform";
import { PlatformActionBar, PlatformActionGroup } from "@/components/platform/action-bar";
import { EmptyState } from "@/components/platform/empty-state";
import { FeedbackBanner } from "@/components/platform/feedback-banner";
import { StatusPill } from "@/components/platform/status-pill";
import { snapshotStatusLabel } from "@/lib/platform/copy";

type ModulePanelProps = {
  eyebrow: string;
  title: string;
  description?: string;
  status?: string;
  metrics?: Array<{ label: string; value: string; detail?: string; status?: string }>;
  actions?: React.ReactNode;
  children?: React.ReactNode;
};

export function ModulePanel({
  eyebrow,
  title,
  description,
  status,
  metrics = [],
  actions,
  children
}: ModulePanelProps) {
  return (
    <section data-module-panel className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 gap-1.5">
          <p className="platform-type-eyebrow">{eyebrow}</p>
          <h2 className="platform-type-page-title">{title}</h2>
          {description ? <p className="platform-type-body max-w-3xl">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {status ? (
        <div>
          <StatusPill status={snapshotStatusLabel(status)} />
        </div>
      ) : null}
      {metrics.length ? <AdminMetricGrid metrics={metrics} className="pb-2" /> : null}
      {children}
    </section>
  );
}

export function AdminMetricGrid({
  metrics,
  className = ""
}: {
  metrics: Array<{ label: string; value: string; detail?: string; status?: string }>;
  className?: string;
}) {
  return (
    <MetricGrid
      className={className}
      metrics={metrics.map((metric) => ({
        label: metric.label,
        value: metric.value,
        detail: metric.detail
      }))}
    />
  );
}

export function AdminSection({
  eyebrow,
  title,
  description,
  actions,
  children,
  className = ""
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section data-admin-section className={`grid gap-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <p className="platform-type-eyebrow mb-1">{eyebrow}</p> : null}
          <h3 className="platform-type-section-title">{title}</h3>
          {description ? <p className="platform-type-caption mt-1.5 max-w-2xl">{description}</p> : null}
        </div>
        {actions ? (
          <PlatformActionBar className="w-auto shrink-0">
            <PlatformActionGroup>{actions}</PlatformActionGroup>
          </PlatformActionBar>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function AdminTableShell({
  title,
  description,
  action,
  children,
  className = ""
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`mithron-elevated-card overflow-hidden rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-4 py-3.5">
        <div>
          <h2 className="platform-type-card-title">{title}</h2>
          {description ? <p className="platform-type-caption mt-1">{description}</p> : null}
        </div>
        {action ? (
          <PlatformActionBar className="w-auto shrink-0">
            <PlatformActionGroup>{action}</PlatformActionGroup>
          </PlatformActionBar>
        ) : null}
      </div>
      <div className="platform-table-shell overflow-x-auto">{children}</div>
    </section>
  );
}

export function AdminFormSection({
  title,
  description,
  children,
  className = ""
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card title={title} description={description} className={className}>
      {children}
    </Card>
  );
}

export function AdminStickyActionFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-[var(--platform-border)] bg-[var(--platform-surface)] px-4 py-3.5 md:-mx-5 md:px-5">
      <PlatformActionBar>
        <PlatformActionGroup>{children}</PlatformActionGroup>
      </PlatformActionBar>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <StatusPill status={status} />;
}

export function OperationalFeedback(props: Parameters<typeof FeedbackBanner>[0]) {
  return <FeedbackBanner {...props} />;
}

export function OperationalStateStrip({
  states
}: {
  states: Array<{ label: string; value: string; status?: string; detail?: string }>;
}) {
  return (
    <div data-operator-state-strip className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      {states.map((state) => (
        <div
          key={`${state.label}-${state.value}`}
          className="rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-3"
        >
          <p className="text-xs font-medium text-[var(--platform-text-muted)]">{state.label}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[var(--platform-text-primary)]">{state.value}</p>
            {state.status ? <StatusPill status={state.status} /> : null}
          </div>
          {state.detail ? <p className="mt-2 text-xs text-[var(--platform-text-muted)]">{state.detail}</p> : null}
        </div>
      ))}
    </div>
  );
}

type OperationalRecord = {
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  thumbnailSrc?: string | null;
  thumbnailAlt?: string;
  metrics?: Array<{ label: string; value: string }>;
};

export function OperationalRecordGrid({
  rows,
  emptyLabel = "No items to display."
}: {
  rows: OperationalRecord[];
  emptyLabel?: string;
}) {
  if (!rows.length) {
    return <EmptyState message={emptyLabel} />;
  }

  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid gap-3 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-3 md:grid-cols-[52px_minmax(0,1fr)_auto] md:items-center"
        >
          <div className="grid size-[52px] place-items-center overflow-hidden rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)]">
            {row.thumbnailSrc ? (
              <Image
                src={row.thumbnailSrc}
                alt={row.thumbnailAlt ?? ""}
                width={56}
                height={56}
                sizes="56px"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xl font-semibold text-[var(--platform-text-muted)]">
                {row.title.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-[var(--platform-text-primary)]">{row.title}</p>
              {row.status ? <StatusPill status={row.status} /> : null}
            </div>
            {row.subtitle ? <p className="mt-1 text-xs text-[var(--platform-text-muted)]">{row.subtitle}</p> : null}
          </div>
          {row.metrics?.length ? (
            <div className="grid min-w-[180px] grid-cols-2 gap-2">
              {row.metrics.map((metric) => (
                <div key={`${row.id}-${metric.label}`} className="rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-1.5">
                  <p className="text-[11px] font-medium text-[var(--platform-text-muted)]">{metric.label}</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--platform-text-primary)]">{metric.value}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function DataList({ rows }: { rows: Array<{ id?: string; label: string; value: string; detail?: string }> }) {
  if (!rows.length) {
    return <EmptyState message="Nothing to show yet." />;
  }

  return (
    <div className="grid gap-2">
      {rows.map((row, index) => (
        <div
          key={row.id ?? `${row.label}-${row.value}-${row.detail ?? ""}-${index}`}
          className="flex items-start justify-between gap-4 rounded-[8px] px-1 py-2 transition-colors hover:bg-[var(--platform-surface-muted)]"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--platform-text-primary)]">{row.label}</p>
            {row.detail ? <p className="mt-0.5 text-xs text-[var(--platform-text-muted)]">{row.detail}</p> : null}
          </div>
          <p className="shrink-0 text-sm text-[var(--platform-text-secondary)]">{row.value}</p>
        </div>
      ))}
    </div>
  );
}
