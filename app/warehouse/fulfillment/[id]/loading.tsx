export default function Loading() {
  return (
    <div
      data-control-plane-content-loading
      className="mb-4 grid gap-4"
      role="status"
      aria-busy="true"
      aria-label="Loading fulfillment detail"
    >
      <span className="sr-only">Loading fulfillment detail</span>
      <div className="grid gap-3 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-4 md:grid-cols-[1fr_16rem]">
        <div className="grid gap-2">
          <div className="platform-loading-pulse h-3 w-20 rounded bg-[var(--platform-surface)]" />
          <div className="platform-loading-pulse h-7 w-48 rounded bg-[var(--platform-surface)]" />
          <div className="platform-loading-pulse h-4 w-40 rounded bg-[var(--platform-surface)]" />
        </div>
        <div className="platform-loading-pulse h-24 rounded-[var(--platform-radius)] bg-[var(--platform-surface)]" />
      </div>
      <div className="grid gap-3 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-4 sm:grid-cols-2">
        <div className="platform-loading-pulse h-28 rounded bg-[var(--platform-surface)]" />
        <div className="platform-loading-pulse h-28 rounded bg-[var(--platform-surface)]" />
      </div>
      <div className="platform-loading-pulse h-40 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]" />
    </div>
  );
}
