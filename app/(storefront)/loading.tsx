import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading Mithron storefront" className="surface-page min-h-screen px-6 py-28 md:px-16">
      <div className="mx-auto max-w-[1440px]">
        <Skeleton className="h-[520px] rounded-[28px] bg-gradient-to-br from-neutral-200 via-white to-neutral-300" />
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-72 bg-[var(--surface-card)]" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading storefront content.</span>
    </div>
  );
}
