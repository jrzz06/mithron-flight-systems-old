"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function WarehouseDashboardRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="platform-btn-secondary platform-btn-sm"
      disabled={isPending}
      aria-busy={isPending ? "true" : undefined}
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
    >
      {isPending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
