"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

type WarehouseOpenOrderLinkProps = {
  orderId: string;
  className?: string;
  onView?: (orderId: string) => void;
  children?: React.ReactNode;
};

export function WarehouseOpenOrderLink({
  orderId,
  className = "platform-btn-primary platform-btn-sm",
  onView,
  children = "Open Order"
}: WarehouseOpenOrderLinkProps) {
  const router = useRouter();
  const href = `/warehouse/fulfillment/${orderId}`;
  const [isPending, startTransition] = useTransition();

  return (
    <Link
      href={href}
      prefetch
      className={`${className} ${isPending ? "opacity-65 pointer-events-none" : ""}`}
      aria-busy={isPending ? "true" : undefined}
      onMouseEnter={() => router.prefetch(href)}
      onFocus={() => router.prefetch(href)}
      onClick={() => {
        onView?.(orderId);
        startTransition(() => {
          /* Link handles navigation; transition marks pending for immediate feedback. */
        });
      }}
    >
      {isPending ? "Opening…" : children}
    </Link>
  );
}
