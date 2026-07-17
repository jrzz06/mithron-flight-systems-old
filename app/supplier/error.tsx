"use client";

import Link from "next/link";
import { useEffect } from "react";

type SupplierErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function SupplierError({ error, reset }: SupplierErrorProps) {
  useEffect(() => {
    console.error("[mithron-supplier] Supplier route render failed.", {
      message: error.message,
      digest: error.digest ?? null
    });
  }, [error]);

  return (
    <main data-supplier-error-boundary className="min-h-screen bg-[#070B14] px-6 py-10 text-[#F5F7FA]">
      <section className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2EE6A6]">Supplier recovery</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">Something went wrong loading this page.</h1>
        <p className="mt-5 max-w-2xl text-sm leading-6 text-[#A7B1C2]">
          The supplier workspace stayed isolated. Retry this view or return to your home page while we look into the issue.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-[#2EE6A6] px-4 py-2 text-sm font-semibold text-[#071019] transition-transform duration-150 hover:-translate-y-0.5"
          >
            Try again
          </button>
          <Link
            href="/supplier"
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#F5F7FA] transition-transform duration-150 hover:-translate-y-0.5"
          >
            Back to supplier home
          </Link>
        </div>
      </section>
    </main>
  );
}
