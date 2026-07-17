type FeedbackBannerProps = {
  status?: string | null;
  message?: string | null;
  context?: string;
  idle?: string;
};

export function FeedbackBanner({
  status,
  message,
  context = "Update",
  idle = "Changes and validation messages will appear here."
}: FeedbackBannerProps) {
  const normalizedStatus =
    status === "success" || status === "error" || status === "warning" || status === "conflict"
      ? status === "conflict"
        ? "warning"
        : status
      : "idle";
  const tone =
    normalizedStatus === "success"
      ? "border-[var(--platform-border)] bg-[var(--platform-success-soft)] text-[var(--platform-success)]"
      : normalizedStatus === "warning"
        ? "border-[var(--platform-border)] bg-[var(--platform-warning-soft)] text-[var(--platform-warning)]"
        : normalizedStatus === "error"
          ? "border-[var(--platform-border)] bg-[var(--platform-danger-soft)] text-[var(--platform-danger)]"
          : "border-[var(--platform-border)] bg-[var(--platform-surface-muted)] text-[var(--platform-text-muted)]";

  return (
    <div
      aria-live="polite"
      role={normalizedStatus === "idle" ? "status" : "alert"}
      data-operational-feedback={normalizedStatus}
      className={`rounded-[var(--platform-radius)] border-0 px-4 py-3 text-sm ${tone}`}
    >
      {normalizedStatus === "idle" ? (
        idle
      ) : (
        <>
          <span className="font-medium">
            {status === "conflict"
              ? "Conflict detected"
              : normalizedStatus === "success"
                ? "Saved"
                : normalizedStatus === "warning"
                  ? "Needs review"
                  : "Something went wrong"}
          </span>
          {message ? <span className="ml-2">{context}: {message}</span> : null}
        </>
      )}
    </div>
  );
}
