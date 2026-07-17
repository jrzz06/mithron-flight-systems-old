"use client";

export function CmsSyncErrorPanel({
  title = "Homepage synchronization error",
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
      className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-950"
      data-cms-sync-error
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 leading-relaxed">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-3 font-semibold text-red-900 underline">
          Retry
        </button>
      ) : null}
    </div>
  );
}
