import { Skeleton } from "@/components/ui/skeleton";

export default function CartLoading() {
  return (
    <main className="surface-page inner-page min-h-screen">
      <section className="mx-auto max-w-[960px] px-6 py-28 md:px-16">
        <Skeleton className="h-10 w-32 rounded-lg bg-[var(--ds-skeleton)]" aria-hidden="true" />
        <div className="mt-8 grid gap-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-[var(--ds-r-xl)] bg-[var(--ds-skeleton)]" aria-hidden="true" />
          ))}
        </div>
        <span className="sr-only">Loading cart.</span>
      </section>
    </main>
  );
}
