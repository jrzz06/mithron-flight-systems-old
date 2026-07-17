"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

type AccountErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AccountError({ error, reset }: AccountErrorProps) {
  useEffect(() => {
    console.error("[mithron-account] Account route render failed.", {
      message: error.message,
      digest: error.digest ?? null
    });
  }, [error]);

  return (
    <div
      data-account-error-boundary
      className="rounded-2xl border border-[var(--account-border)] bg-[var(--account-surface)] p-6 md:p-8"
    >
      <p className="text-sm font-medium text-[var(--account-accent)]">Something went wrong</p>
      <h2 className="mt-2 text-xl font-semibold text-[var(--account-ink)]">Your account page could not load</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--account-ink-muted)]">
        Your orders and enquiries are still safe. Try again or return to your account overview.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/account">Back to account</Link>
        </Button>
      </div>
    </div>
  );
}
