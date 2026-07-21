import { Skeleton } from "@/components/ui/skeleton";

export default function CategoryLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading category" className="surface-page min-h-screen px-3 py-28 md:px-8">
      <div className="mx-auto max-w-[1440px]">
        <Skeleton className="h-[420px] rounded-[28px] bg-[var(--ds-skeleton)]" />
        <div className="mt-10 grid grid-cols-2 gap-[var(--mobile-grid-gap,10px)] lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-72 rounded-[20px] bg-[var(--ds-skeleton)]" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading products.</span>
    </div>
  );
}
