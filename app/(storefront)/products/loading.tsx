import { Skeleton } from "@/components/ui/skeleton";

export default function ProductsLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading products" className="surface-page min-h-screen px-6 py-28 md:px-16">
      <div className="mx-auto max-w-[1440px]">
        <Skeleton className="h-12 w-64 rounded-lg bg-[var(--ds-skeleton)]" />
        <Skeleton className="mt-4 h-6 w-96 max-w-full rounded-lg bg-[var(--ds-skeleton)]" />
        <div className="mt-10 grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-72 rounded-[20px] bg-[var(--ds-skeleton)]" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading product showroom.</span>
    </div>
  );
}
