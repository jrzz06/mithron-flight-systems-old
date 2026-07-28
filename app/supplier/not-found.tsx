import Link from "next/link";

export default function SupplierNotFound() {
  return (
    <div className="grid min-h-[50vh] place-items-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--platform-text-primary)]">
          Page not found
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--platform-text-secondary)]">
          This supplier page is not available. Go back to your products or home overview.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/supplier/products"
            className="platform-btn-primary platform-btn-md inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold"
          >
            My products
          </Link>
          <Link
            href="/supplier"
            className="platform-btn-secondary platform-btn-md inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Supplier home
          </Link>
        </div>
      </div>
    </div>
  );
}
