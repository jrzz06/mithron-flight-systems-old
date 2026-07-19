import type { CustomerOrderSource, CustomerProgressStep } from "@/lib/orders/lifecycle";
import { formatOrderDate } from "@/lib/customer/display";

type TrackingDetails = {
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl?: string | null;
};

type OrderProgressTrackerProps = {
  steps: CustomerProgressStep[];
  paymentLabel: string;
  tracking?: TrackingDetails | null;
  estimatedDelivery?: string | null;
  orderSource: CustomerOrderSource;
  sourceLabel: string;
  showSourceLabel?: boolean;
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M5 10.5 8.2 13.7 15 6.9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OrderProgressTracker({
  steps,
  paymentLabel,
  tracking,
  estimatedDelivery,
  sourceLabel,
  showSourceLabel = false
}: OrderProgressTrackerProps) {
  const currentStep = steps.find((step) => step.state === "current") ?? steps.at(-1);
  const showTracking = Boolean(
    tracking && (tracking.carrier || tracking.trackingNumber || tracking.trackingUrl)
    && steps.some((step) =>
      (step.label === "Dispatched" || step.label === "Delivered")
      && step.state !== "upcoming"
    )
  );

  return (
    <div
      data-order-progress-tracker
      className="rounded-2xl border border-[var(--account-border)] bg-[var(--account-surface-muted)] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--account-ink-muted)]">
            Order status
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--account-ink)] sm:text-3xl">
            {currentStep?.label ?? "Processing"}
          </p>
          {showSourceLabel ? (
            <p className="mt-1 text-sm text-[var(--account-ink-muted)]">{sourceLabel}</p>
          ) : null}
        </div>
        <span className="inline-flex rounded-full border border-[var(--account-border)] bg-[var(--account-surface)] px-3 py-1 text-sm font-medium text-[var(--account-ink)]">
          Payment: {paymentLabel}
        </span>
      </div>

      <div className="mt-8">
        <ol className="grid gap-6 sm:grid-cols-4 sm:gap-3">
          {steps.map((step, index) => {
            const isDone = step.state === "done";
            const isCurrent = step.state === "current";
            const connectorDone = isDone && steps[index + 1]?.state !== "upcoming";

            return (
              <li key={`${step.label}-${index}`} className="relative flex gap-3 sm:block sm:text-center">
                {index < steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={`absolute left-[15px] top-8 hidden h-[calc(100%+0.5rem)] w-0.5 sm:left-[calc(50%-0.5px)] sm:top-5 sm:block sm:h-0.5 sm:w-[calc(100%+0.75rem)] ${
                      connectorDone ? "bg-[var(--account-success)]" : "bg-[var(--account-border)]"
                    }`}
                  />
                ) : null}

                <div
                  className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold sm:mx-auto ${
                    isDone
                      ? "border-[var(--account-success)] bg-[var(--account-success)] text-white"
                      : isCurrent
                        ? "border-[var(--platform-accent)] bg-[var(--platform-accent-soft)] text-[var(--account-ink)]"
                        : "border-[var(--account-border)] bg-[var(--account-surface)] text-[var(--account-ink-muted)]"
                  }`}
                >
                  {isDone ? <CheckIcon /> : index + 1}
                </div>

                <div className="min-w-0 flex-1 sm:mt-3">
                  <p
                    className={`text-sm leading-snug sm:text-base ${
                      isCurrent
                        ? "font-semibold text-[var(--account-ink)]"
                        : isDone
                          ? "font-medium text-[var(--account-ink)]"
                          : "text-[var(--account-ink-muted)]"
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.completedAt ? (
                    <p className="mt-1 text-xs text-[var(--account-ink-muted)]">
                      {formatOrderDate(step.completedAt)}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {estimatedDelivery ? (
        <p className="mt-6 text-sm text-[var(--account-ink-muted)]">
          Estimated delivery: <span className="font-medium text-[var(--account-ink)]">{estimatedDelivery}</span>
        </p>
      ) : null}

      {showTracking ? (
        <div className="mt-6 rounded-xl border border-[var(--account-border)] bg-[var(--account-surface)] px-4 py-3 text-sm text-[var(--account-ink)]">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--account-ink-muted)]">
            Shipment tracking
          </p>
          {tracking?.carrier ? <p className="mt-2">Courier: {tracking.carrier}</p> : null}
          {tracking?.trackingNumber ? (
            <p className="mt-1 break-all font-medium">Tracking number: {tracking.trackingNumber}</p>
          ) : null}
          {tracking?.trackingUrl ? (
            <p className="mt-2">
              <a
                href={tracking.trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--platform-accent)] hover:underline"
              >
                Track shipment
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
