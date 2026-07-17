import { Skeleton } from "@/components/ui/skeleton";

export default function AccountLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading account content">
      <Skeleton className="h-8 w-48 bg-[var(--account-surface-muted)]" />
      <Skeleton className="h-32 rounded-2xl bg-[var(--account-surface-muted)]" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24 rounded-2xl bg-[var(--account-surface-muted)]" />
        <Skeleton className="h-24 rounded-2xl bg-[var(--account-surface-muted)]" />
        <Skeleton className="h-24 rounded-2xl bg-[var(--account-surface-muted)]" />
      </div>
      <Skeleton className="h-40 rounded-2xl bg-[var(--account-surface-muted)]" />
    </div>
  );
}
