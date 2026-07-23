import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant route fallback for product navigations.
 * Reserves hero / title / price / CTA geometry so CLS stays ~0.
 * Below-fold sections (reviews, related) may still stream in.
 */
export default function ProductLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading product"
      className="product-detail-page surface-page min-h-screen px-6 pb-28 pt-[calc(var(--store-nav-offset,56px)+1.5rem)] md:px-16"
    >
      <div className="mx-auto max-w-[1440px]">
        <Skeleton className="h-5 w-40 rounded-md bg-[var(--ds-skeleton)]" />
        <div className="mt-8 grid items-start gap-8 min-[1024px]:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="min-w-0">
            <div
              className="relative w-full overflow-hidden rounded-[28px] bg-[var(--ds-skeleton)]"
              style={{ aspectRatio: "1 / 1" }}
              aria-hidden
            />
          </div>
          <div className="flex min-h-[420px] flex-col gap-4">
            <Skeleton className="h-10 w-[85%] max-w-md rounded-lg bg-[var(--ds-skeleton)]" />
            <Skeleton className="h-7 w-36 rounded-lg bg-[var(--ds-skeleton)]" />
            <Skeleton className="mt-2 h-12 w-full max-w-sm rounded-full bg-[var(--ds-skeleton)]" />
            <Skeleton className="h-28 w-full rounded-[20px] bg-[var(--ds-skeleton)]" />
            <Skeleton className="mt-auto h-40 w-full rounded-[20px] bg-[var(--ds-skeleton)]" />
          </div>
        </div>
      </div>
      <span className="sr-only">Loading product details.</span>
    </div>
  );
}
