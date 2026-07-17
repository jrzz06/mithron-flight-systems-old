import { Skeleton } from "@/components/ui/skeleton";

export default function BlogLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading blog" className="surface-page min-h-screen px-6 py-28 md:px-16">
      <div className="mx-auto max-w-[960px]">
        <Skeleton className="h-10 w-40 rounded-lg bg-[var(--ds-skeleton)]" />
        <Skeleton className="mt-4 h-6 w-full max-w-xl rounded-lg bg-[var(--ds-skeleton)]" />
        <div className="mt-10 grid gap-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-[20px] bg-[var(--ds-skeleton)]" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading blog posts.</span>
    </div>
  );
}
