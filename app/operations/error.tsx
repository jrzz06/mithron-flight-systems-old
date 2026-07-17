"use client";

import Link from "next/link";
import { useEffect } from "react";

type OperationsErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function OperationsError({ error, reset }: OperationsErrorProps) {
  useEffect(() => {
    console.error("[mithron-operations] Operations route render failed.", {
      message: error.message || "(empty)",
      name: error.name,
      digest: error.digest ?? null,
      stack: error.stack ?? null,
      raw: String(error)
    });
  }, [error]);

  return (
    <main data-operations-error-boundary data-control-plane data-control-plane-theme="dark" className="min-h-screen bg-[var(--platform-bg)] px-6 py-10 text-[var(--platform-text-primary)]">
      <section className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Operations recovery</p>
        <h1 className="mt-4 text-2xl font-medium tracking-tight md:text-3xl">This operations view could not be rendered.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--platform-text-muted)]">
          The operations shell stayed isolated. Retry this view or return to the operations dashboard.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="platform-btn-primary h-10 rounded-[8px] px-4 text-sm font-medium"
          >
            Try again
          </button>
          <Link
            href="/operations"
            className="inline-flex h-10 items-center rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-4 text-sm font-medium text-[var(--platform-text-primary)] transition hover:bg-[var(--platform-surface-muted)]"
          >
            Back to operations
          </Link>
        </div>
      </section>
    </main>
  );
}
