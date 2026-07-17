import { Skeleton } from "@/components/ui/skeleton";
import styles from "./checkout.module.css";

export default function CheckoutLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading checkout" className={styles.page}>
      <div className={styles.container}>
        <Skeleton className="h-4 w-28 rounded-md bg-slate-200" />
        <Skeleton className="mt-3 h-10 w-full max-w-xl rounded-md bg-slate-200" />
        <div className={`${styles.layout} mt-10`}>
          <div className={`${styles.formPanel} grid gap-4`}>
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 rounded-xl bg-slate-200" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-[1.75rem] bg-slate-200" />
        </div>
      </div>
      <span className="sr-only">Loading checkout form.</span>
    </div>
  );
}
