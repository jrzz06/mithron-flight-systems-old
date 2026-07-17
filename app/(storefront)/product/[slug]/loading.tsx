import { Skeleton } from "@/components/ui/skeleton";

export default function ProductLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading product" className="surface-page min-h-screen px-6 py-28 md:px-16">
      <div className="mx-auto max-w-[1440px]">
        <Skeleton className="h-8 w-48 rounded-lg bg-[var(--ds-skeleton)]" />
        <div className="mt-8 grid gap-8 min-[1024px]:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <Skeleton className="aspect-square rounded-[28px] bg-[var(--ds-skeleton)]" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4 rounded-lg bg-[var(--ds-skeleton)]" />
            <Skeleton className="h-6 w-1/3 rounded-lg bg-[var(--ds-skeleton)]" />
            <Skeleton className="h-32 rounded-[20px] bg-[var(--ds-skeleton)]" />
          </div>
        </div>
      </div>
      <span className="sr-only">Loading product details.</span>
    </div>
  );
}
