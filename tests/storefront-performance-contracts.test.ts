import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REDIS_CACHE_READ_TIMEOUT_MS,
  REDIS_CACHE_WRITE_TIMEOUT_MS,
  REDIS_CACHE_LOCK_TIMEOUT_MS,
  getRedisTimingStats
} from "@/lib/redis-client";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("storefront performance contracts", () => {
  it("fails Redis cache reads open within 250ms (prefer Supabase over slow Upstash)", () => {
    expect(REDIS_CACHE_READ_TIMEOUT_MS).toBeLessThanOrEqual(250);
    expect(REDIS_CACHE_WRITE_TIMEOUT_MS).toBeLessThanOrEqual(800);
    expect(REDIS_CACHE_LOCK_TIMEOUT_MS).toBeLessThanOrEqual(300);
    expect(source("lib/redis-client.ts")).toContain("logRedisEndpointRegionOnce");
    expect(source("lib/redis-client.ts")).toContain("recordRedisSample");
    expect(source("lib/redis-client.ts")).toContain("isRedisCircuitOpen");
    expect(getRedisTimingStats().samples).toBeGreaterThanOrEqual(0);
  });

  it("collapses concurrent cache loaders in-process before Redis locks", () => {
    const cacheRedis = source("lib/cache-redis.ts");
    expect(cacheRedis).toContain("inProcessFlights");
    expect(cacheRedis).toContain("runSingleFlight");
    expect(cacheRedis).toContain("memoryCache");
    expect(cacheRedis).toContain("shouldUseRedisBackend");
    expect(cacheRedis).toContain("productPage:");
  });

  it("limits enterprise menu queries per category instead of a 500-row scan", () => {
    const catalog = source("services/catalog.ts");
    expect(catalog).toContain("ENTERPRISE_MENU_PER_CATEGORY_LIMIT");
    expect(catalog).toContain("`limit=${ENTERPRISE_MENU_PER_CATEGORY_LIMIT}`");
    expect(catalog).toContain("fetchEnterpriseMenuRowsByCategory");
    expect(catalog).toMatch(/category=eq\.\$\{encodeURIComponent\(categoryName\)\}/);
    expect(catalog).toMatch(/HOMEPAGE_PRODUCT_LIMIT\s*=\s*36/);
    expect(catalog).toMatch(/CATALOG_SHOWROOM_LIMIT\s*=\s*96/);
  });

  it("coalesces PDP into product:page Redis key and keeps summary on product:core", () => {
    const catalog = source("services/catalog.ts");
    const summary = source("app/api/products/summary/route.ts");
    const invalidation = source("lib/cache-invalidation.ts");

    expect(catalog).toContain("REDIS_CACHE_KEYS.productPage");
    expect(summary).toContain("getProductCoreBySlug");
    expect(summary).not.toContain("loadProductForPage");
    expect(invalidation).toContain("product:page:");
  });

  it("ships View Transition + LCP/CLS guards for storefront navigation", () => {
    const globals = source("app/globals.css");
    const layout = source("app/layout.tsx");
    const fonts = source("lib/fonts/storefront.ts");
    const gallery = source("sections/product/showcase/product-immersive-gallery.tsx");

    expect(globals).toContain("product-media-morph");
    expect(globals).toContain("--ease-product-nav");
    expect(globals).toContain('html[data-product-nav="pending"]');
    expect(globals).toContain(".home-page-canvas .mithron-responsive-image");
    expect(layout).toContain('data-scroll-behavior="smooth"');
    expect(fonts).toContain('adjustFontFallback: "Arial"');
    expect(gallery).toContain("Seed primary slide as ready");
  });

  it("keeps a unified 220ms search sheet motion contract", () => {
    const searchCss = source("components/overlays/search-overlay.module.css");
    const marquee = source("hooks/use-css-marquee.ts");
    const liveSync = source("components/control-plane/use-control-plane-live-sync.ts");

    expect(searchCss).toContain("clip-path:");
    expect(searchCss).toContain("220ms cubic-bezier(0.16, 1, 0.3, 1)");
    expect(searchCss).toContain("background: #ffffff");
    expect(marquee).not.toContain("void track.offsetHeight");
    expect(liveSync).toContain("STOREFRONT_ROUTER_REFRESH_COALESCE_MS");
  });

  it("keeps storefront CSS payload within budget and documents bundle analyze path", () => {
    const globals = source("app/globals.css");
    const composite = source("sections/home/home-landing-composite.module.css");
    // Soft budgets — catch accidental CSS explosions without blocking legitimate design work.
    expect(Buffer.byteLength(globals, "utf8")).toBeLessThan(220_000);
    expect(Buffer.byteLength(composite, "utf8")).toBeLessThan(120_000);
    expect(source("package.json")).toContain('"analyze"');
    expect(source("lighthouserc.json")).toContain("largest-contentful-paint");
    expect(source("lighthouserc.json")).toContain("0.05");
  });
});
