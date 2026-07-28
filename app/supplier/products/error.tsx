"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function SupplierProductsError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[mithron-supplier] Supplier products view error.", {
      message: error.message,
      digest: error.digest ?? null
    });
  }, [error]);

  return (
    <div data-supplier-products-error className="grid gap-4 rounded-xl border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-6">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-[var(--platform-text-primary)]">Products workspace error</h2>
        <p className="text-sm text-[var(--platform-text-secondary)]">
          {error.message || "An unexpected error occurred while loading supplier products."}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="platform-btn-primary platform-btn-sm"
        >
          Try again
        </button>
        <Link href="/supplier/products" className="platform-btn-secondary platform-btn-sm">
          Return to My products
        </Link>
      </div>
    </div>
  );
}
