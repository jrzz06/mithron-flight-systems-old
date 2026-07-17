import "@/app/storefront-density.css";
import "@/app/storefront-catalog.css";
import { Suspense } from "react";
import {
  StorefrontShellFooterChrome,
  StorefrontShellHeaderChrome
} from "@/components/layout/storefront-shell-chrome";
import { StorefrontShellStreamingLayout } from "@/components/layout/storefront-shell-streaming";
import { StorefrontLiveSync } from "@/components/storefront/storefront-live-sync";
import { Skeleton } from "@/components/ui/skeleton";

function StorefrontNavFallback() {
  return (
    <div
      className="animate-pulse bg-[#dfe3e8]"
      style={{ height: "var(--store-nav-offset, 56px)" }}
      aria-hidden="true"
    />
  );
}

function StorefrontFooterFallback() {
  return <div className="min-h-[12rem] animate-pulse bg-[#e8eaed]" aria-hidden="true" />;
}

function StorefrontPageFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading page"
      className="surface-page min-h-[50vh] px-6 py-16 md:px-16"
    >
      <div className="mx-auto max-w-[1440px]">
        <Skeleton className="h-10 w-48 bg-[var(--surface-card)]" />
        <Skeleton className="mt-6 h-64 w-full rounded-[24px] bg-[var(--surface-card)]" />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-48 bg-[var(--surface-card)]" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading page content.</span>
    </div>
  );
}

export default function StorefrontLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <StorefrontLiveSync />
      <StorefrontShellStreamingLayout
        headerChrome={(
          <Suspense fallback={<StorefrontNavFallback />}>
            <StorefrontShellHeaderChrome />
          </Suspense>
        )}
        footerChrome={(
          <Suspense fallback={<StorefrontFooterFallback />}>
            <StorefrontShellFooterChrome />
          </Suspense>
        )}
      >
        <Suspense fallback={<StorefrontPageFallback />}>{children}</Suspense>
      </StorefrontShellStreamingLayout>
    </>
  );
}
