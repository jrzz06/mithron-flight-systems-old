"use client";

import Link from "next/link";
import { useEffect } from "react";
import { recordClientError } from "@/lib/observability";

type StorefrontErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function StorefrontError({ error, reset }: StorefrontErrorProps) {
  useEffect(() => {
    recordClientError({
      name: error.name,
      message: error.message,
      digest: error.digest,
      stack: error.stack
    });
  }, [error]);

  return (
    <main data-storefront-error-boundary className="min-h-screen bg-[var(--surface-page)] px-6 py-24 text-[#0f172a]">
      <section className="mx-auto flex min-h-[62vh] max-w-2xl flex-col justify-center">
        <p className="type-meta text-[#64748b]">Storefront recovery</p>
        <h1 className="type-page mt-4">This Mithron view could not load.</h1>
        <p className="type-body mt-5 max-w-xl text-[#64748b]">
          The storefront shell stayed available. Retry this view, or return to the product catalog while the failed route is investigated.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="type-button inline-flex h-11 items-center rounded-full bg-[#0f172a] px-5 text-white transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
          >
            Try again
          </button>
          <Link
            href="/products"
            className="type-button inline-flex h-11 items-center rounded-full border border-slate-300 bg-white px-5 text-[#0f172a] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
          >
            Browse products
          </Link>
        </div>
      </section>
    </main>
  );
}
