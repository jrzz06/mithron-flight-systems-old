import { Skeleton } from "@/components/ui/skeleton";
import "@/app/account.css";

export default function TrackOrderLoading() {
  return (
    <main
      className="account-hub surface-page min-h-screen px-4 py-20 sm:px-6 md:py-24 lg:px-8"
      role="status"
      aria-live="polite"
      aria-label="Loading order tracking"
    >
      <div className="mx-auto max-w-[820px]">
        <Skeleton className="h-3 w-28 bg-[var(--account-surface-muted)]" />
        <Skeleton className="mt-3 h-9 w-64 bg-[var(--account-surface-muted)]" />
        <Skeleton className="mt-3 h-16 w-full max-w-xl bg-[var(--account-surface-muted)]" />
        <Skeleton className="mt-8 h-40 w-full rounded-2xl bg-[var(--account-surface-muted)]" />
      </div>
      <span className="sr-only">Loading order tracking.</span>
    </main>
  );
}
