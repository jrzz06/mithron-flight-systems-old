"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function SupplierNewProductError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[mithron-supplier] Supplier new product form error.", {
      message: error.message,
      digest: error.digest ?? null
    });
  }, [error]);

  return (
    <div data-supplier-new-product-error className="grid gap-4 rounded-xl border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-6">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-[var(--platform-text-primary)]">Product creation error</h2>
        <p className="text-sm text-[var(--platform-text-secondary)]">
          {error.message || "An unexpected error occurred while rendering the product form."}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="platform-btn-primary platform-btn-sm"
        >
          Reset form
        </button>
        <Link href="/supplier/products" className="platform-btn-secondary platform-btn-sm">
          Back to products
        </Link>
      </div>
    </div>
  );
}
