"use client";

import Link from "next/link";
import { useEffect } from "react";

type WarehouseErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function WarehouseError({ error, reset }: WarehouseErrorProps) {
  useEffect(() => {
    console.error("[mithron-warehouse] Warehouse route render failed.", {
      message: error.message,
      digest: error.digest ?? null
    });
  }, [error]);

  return (
    <main data-warehouse-error-boundary className="min-h-screen bg-[#070B14] px-6 py-10 text-[#F5F7FA]">
      <section className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2EE6A6]">Warehouse recovery</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">Warehouse panel could not render this view.</h1>
        <p className="mt-5 max-w-2xl text-sm leading-6 text-[#A7B1C2]">
          The warehouse workspace stayed isolated. Retry this view or return to dispatch operations while the failed widget is investigated.
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
            href="/warehouse/dashboard"
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#F5F7FA] transition-transform duration-150 hover:-translate-y-0.5"
          >
            Back to warehouse
          </Link>
        </div>
      </section>
    </main>
  );
}
