import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/redis-client", () => ({
  getRedisClient: vi.fn(() => null),
  isRedisConfigured: vi.fn(() => false),
  getRedisRestCredentials: vi.fn(() => null),
  withRedisTimeout: vi.fn((_label: string, promise: Promise<unknown>) => promise)
}));

describe("cache-redis fail-soft", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null when redis is not configured", async () => {
    const { getCachedJson, setCachedJson, deleteCachedKeys } = await import("@/lib/cache-redis");
    await expect(getCachedJson("catalog:search-index:v1")).resolves.toBeNull();
    await expect(setCachedJson("catalog:search-index:v1", { ok: true }, 60)).resolves.toBeUndefined();
    await expect(deleteCachedKeys(["catalog:search-index:v1"])).resolves.toBeUndefined();
  });

  it("readThroughCache falls back to loader when redis is unavailable", async () => {
    const { readThroughCache } = await import("@/lib/cache-redis");
    const value = await readThroughCache("cms:homepage:v1", 60, async () => ({ products: [] }));
    expect(value).toEqual({ products: [] });
  });

  it("acquireRedisLock fail-opens when redis is unavailable", async () => {
    const { acquireRedisLock } = await import("@/lib/cache-redis");
    await expect(acquireRedisLock("lock:expire-pending-payments", 60)).resolves.toBe(true);
  });

  it("acquireRedisLockStrict fails closed in production when redis is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { acquireRedisLockStrict } = await import("@/lib/cache-redis");
    await expect(acquireRedisLockStrict("lock:expire-pending-payments", 60)).resolves.toBe("unavailable");
    vi.unstubAllEnvs();
  });

  it("checkout idempotency lock rejects when Redis is unavailable in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { acquireRedisLockStrict } = await import("@/lib/cache-redis");
    const outcome = await acquireRedisLockStrict("idempotency:checkout:test-key", 120);
    expect(outcome).toBe("unavailable");
    // Checkout route maps unavailable → 503 so duplicate checkouts cannot slip through.
    expect(outcome === "unavailable").toBe(true);
    vi.unstubAllEnvs();
  });

  it("withSingleFlight loads once and returns the value when redis is unavailable", async () => {
    const { withSingleFlight } = await import("@/lib/cache-redis");
    let loads = 0;
    const value = await withSingleFlight("cms:homepage:v1", 60, async () => {
      loads += 1;
      return { products: [] };
    });
    expect(value).toEqual({ products: [] });
    expect(loads).toBe(1);
  });

  it("withSingleFlight respects loaderTimeoutMs override", async () => {
    const { withSingleFlight } = await import("@/lib/cache-redis");
    const { ActionTimeoutError } = await import("@/lib/fetch-with-timeout");
    await expect(
      withSingleFlight(
        "cms:homepage:timeout-test",
        60,
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 80));
          return { products: [] };
        },
        { loaderTimeoutMs: 20 }
      )
    ).rejects.toBeInstanceOf(ActionTimeoutError);
  });
});
