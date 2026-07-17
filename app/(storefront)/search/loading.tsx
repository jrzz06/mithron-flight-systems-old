import { Skeleton } from "@/components/ui/skeleton";

export default function SearchLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading search results" className="surface-page min-h-screen px-6 py-28 md:px-16">
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-12 w-full max-w-xl rounded-lg bg-[var(--ds-skeleton)]" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-56 rounded-[20px] bg-[var(--ds-skeleton)]" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading search results.</span>
    </div>
  );
}
