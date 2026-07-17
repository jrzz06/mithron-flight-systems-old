import Link from "next/link";
import { TrackOrderClient } from "@/components/customer/track-order-client";
import "@/app/account.css";

export const dynamic = "force-dynamic";

export default function TrackOrderPage() {
  return (
    <main className="account-hub surface-page min-h-screen px-4 py-20 sm:px-6 md:py-24 lg:px-8">
      <div className="mx-auto max-w-[820px]">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--account-ink-muted)]">Order tracking</p>
        <h1 className="type-section mt-2 text-[var(--account-ink)]">Track your order</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--account-ink-muted)]">
          Look up delivery status and shipment tracking without signing in.
          {" "}
          <Link href="/account/orders" className="font-medium text-[var(--account-accent)] hover:underline">
            View your orders
          </Link>
          {" "}
          if you are signed in.
        </p>
        <div className="mt-8">
          <TrackOrderClient />
        </div>
      </div>
    </main>
  );
}
