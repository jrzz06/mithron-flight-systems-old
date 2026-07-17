import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("production readiness architecture", () => {
  it("installs storefront and global error boundaries with observable retry paths", () => {
    expect(existsSync(join(root, "app", "error.tsx"))).toBe(true);
    expect(existsSync(join(root, "app", "(storefront)", "error.tsx"))).toBe(true);
    expect(existsSync(join(root, "app", "global-error.tsx"))).toBe(true);

    const storefrontBoundary = source("app/error.tsx");
    const storefrontSegmentBoundary = source("app/(storefront)/error.tsx");
    const globalBoundary = source("app/global-error.tsx");

    for (const boundary of [storefrontBoundary, storefrontSegmentBoundary, globalBoundary]) {
      expect(boundary).toContain("\"use client\"");
      expect(boundary).toContain("recordClientError");
      expect(boundary).toContain("reset()");
      expect(boundary).toContain("Try again");
    }

    expect(storefrontBoundary).toContain("data-storefront-error-boundary");
    expect(storefrontSegmentBoundary).toContain("data-storefront-segment-error-boundary");
    expect(globalBoundary).toContain("data-global-error-boundary");
  });

  it("wires typed observability and analytics into the root app shell", () => {
    expect(existsSync(join(root, "lib", "observability.ts"))).toBe(true);
    expect(existsSync(join(root, "lib", "retry.ts"))).toBe(true);
    expect(existsSync(join(root, "components", "providers", "observability-provider.tsx"))).toBe(true);

    const observability = source("lib/observability.ts");
    const retry = source("lib/retry.ts");
    const provider = source("components/providers/observability-provider.tsx");
    const layout = source("app/layout.tsx");

    expect(observability).toContain("type ObservabilityDeliveryState");
    expect(observability).toContain("recordAnalyticsEvent");
    expect(observability).toContain("recordClientError");
    expect(observability).toContain("recordWebVital");
    expect(observability).toContain("flushObservabilityQueue");
    expect(observability).toContain("NEXT_PUBLIC_OBSERVABILITY_ENDPOINT");
    expect(observability).toContain("retryAsync");
    expect(retry).toContain("export async function retryAsync");
    expect(retry).toContain("attempts");
    expect(retry).toContain("onRetry");
    expect(provider).toContain("useReportWebVitals");
    expect(provider).toContain("window.addEventListener(\"error\"");
    expect(provider).toContain("window.addEventListener(\"unhandledrejection\"");
    expect(provider).toContain("recordAnalyticsEvent");
    expect(layout).toContain("ObservabilityProvider");
  });

  it("uses production metadata and baseline browser security headers", () => {
    const layout = source("app/layout.tsx");
    const siteUrl = source("lib/site-url.ts");
    const nextConfig = source("next.config.ts");

    expect(siteUrl).toContain("NEXT_PUBLIC_SITE_URL");
    expect(layout).toContain("getSiteUrl");
    expect(layout).not.toContain('metadataBase: new URL("http://127.0.0.1:3000")');
    expect(layout).toContain("openGraph");
    expect(layout).toContain("alternates");
    expect(nextConfig).toContain("X-Content-Type-Options");
    expect(nextConfig).toContain("X-Frame-Options");
    expect(nextConfig).toContain("Referrer-Policy");
    expect(nextConfig).toContain("Permissions-Policy");
  });

  it("standardizes skeleton loading states and CMS empty state semantics", () => {
    expect(existsSync(join(root, "components", "ui", "skeleton.tsx"))).toBe(true);

    const loading = source("app/(storefront)/loading.tsx");
    const hero = source("sections/home/hero-carousel.tsx");

    expect(loading).toContain("Skeleton");
    expect(loading).toContain("role=\"status\"");
    expect(loading).toContain("aria-live=\"polite\"");
    expect(hero).toContain("data-cms-hero-empty-state");
    expect(hero).not.toContain("data-hero-empty-state");
    expect(hero).toContain("Explore products");
  });

  it("marks linked shelf thumbnails as decorative when adjacent text already names the product", () => {
    const composite = source("sections/home/home-landing-composite.tsx");

    expect(composite).toContain("alt=\"\"");
    expect(composite).toContain("aria-hidden");
    expect(composite).toContain("Product thumbnail is decorative because the adjacent link text names the product.");
  });
});
