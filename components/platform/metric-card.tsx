type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  trend?: string;
  emphasis?: "default" | "subtle";
};

export function MetricCard({ label, value, detail, trend, emphasis = "default" }: MetricCardProps) {
  return (
    <div
      className={`rounded-[var(--platform-radius)] px-1 py-2 ${
        emphasis === "subtle" ? "bg-transparent" : "bg-transparent"
      }`}
    >
      <p className="truncate text-[11px] font-medium uppercase tracking-[0.05em] text-[var(--platform-text-muted)]">{label}</p>
      <p className="mt-1.5 text-xl font-medium tracking-tight text-[var(--platform-text-primary)] tabular-nums">{value}</p>
      {detail ? <p className="mt-1 text-xs text-[var(--platform-text-muted)]">{detail}</p> : null}
      {trend ? <p className="mt-1 text-xs font-medium text-[var(--platform-text-secondary)]">{trend}</p> : null}
    </div>
  );
}

export function MetricGrid({
  metrics,
  className = "",
  emphasis = "default"
}: {
  metrics: MetricCardProps[];
  className?: string;
  emphasis?: "default" | "subtle";
}) {
  if (!metrics.length) return null;
  return (
    <div data-admin-metric-grid className={`grid gap-4 sm:grid-cols-3 ${className}`}>
      {metrics.map((metric) => (
        <MetricCard key={`${metric.label}-${metric.value}`} {...metric} emphasis={emphasis} />
      ))}
    </div>
  );
}
