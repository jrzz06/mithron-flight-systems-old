"use client";

export function CmsSyncErrorPanel({
  title = "Catalog Status",
  message,
  onRetry
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-4 py-4 text-sm text-[var(--platform-text-primary)]"
      data-cms-sync-error
    >
      <p className="font-semibold text-[var(--platform-text-secondary)]">{title}</p>
      <p className="mt-1 leading-relaxed">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-3 platform-btn-secondary platform-btn-sm">
          Retry
        </button>
      ) : null}
    </div>
  );
}
