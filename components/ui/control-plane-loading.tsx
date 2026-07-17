type ControlPlaneLoadingProps = {
  label?: string;
  metricCount?: number;
  panelCount?: number;
};

export function ControlPlaneLoading({
  label = "Loading workspace",
  metricCount = 4,
  panelCount = 2
}: ControlPlaneLoadingProps) {
  return (
    <div className="grid gap-5" role="status" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-5">
        <div className="platform-loading-pulse h-4 w-28 rounded bg-[var(--platform-surface-muted)]" />
        <div className="platform-loading-pulse mt-3 h-8 w-64 max-w-full rounded bg-[var(--platform-surface-muted)]" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: metricCount }).map((_, index) => (
            <div key={index} className="platform-loading-pulse h-24 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]" />
          ))}
        </div>
      </div>
      <div className={`grid gap-4 ${panelCount > 1 ? "xl:grid-cols-2" : ""}`}>
        {Array.from({ length: panelCount }).map((_, index) => (
          <div key={index} className="platform-loading-pulse h-64 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] xl:h-80" />
        ))}
      </div>
    </div>
  );
}
