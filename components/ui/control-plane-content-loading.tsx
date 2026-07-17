type ControlPlaneContentLoadingProps = {
  label?: string;
};

export function ControlPlaneContentLoading({
  label = "Loading workspace content"
}: ControlPlaneContentLoadingProps) {
  return (
    <div
      data-control-plane-content-loading
      className="mb-4 grid gap-3 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-4"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
      <div className="platform-loading-pulse h-4 w-32 rounded bg-[var(--platform-surface)]" />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="platform-loading-pulse h-20 rounded-[var(--platform-radius)] bg-[var(--platform-surface)]" />
        ))}
      </div>
      <div className="platform-loading-pulse h-48 rounded-[var(--platform-radius)] bg-[var(--platform-surface)]" />
    </div>
  );
}
