import { randomUUID } from "node:crypto";
import { getRedisClient, withRedisTimeout } from "@/lib/redis-client";

const SINGLE_FLIGHT_LOCK_TTL_SECONDS = 8;
const SINGLE_FLIGHT_WAIT_BUDGET_MS = 6_000;

function isProductionRuntime() {
  // Bracket access avoids Vite/Next statically inlining NODE_ENV so tests can stub it.
  return process.env["NODE_ENV"] === "production";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const REDIS_CACHE_KEYS = {
  catalogSearchIndex: "catalog:search-index:v1",
  catalogShowroom: "catalog:showroom:v1",
  catalogCategory: (slug: string) => `catalog:category:${slug}:v1`,
  catalogMediaMap: (hash: string) => `catalog:media:${hash}:v1`,
  cmsHomepage: "cms:homepage:v1",
  cmsShell: "cms:shell:v1",
  productCore: (slug: string) => `product:core:${slug}`,
  authRoleContext: (userId: string, sessionIat: number) => `auth:role:${userId}:${sessionIat}`,
  authRoleContextPrefix: (userId: string) => `auth:role:${userId}:`,
  adminNavMetrics: "metrics:admin-nav:v1",
  warehouseNavMetrics: "metrics:warehouse-nav:v1",
  supplierNavMetrics: (supplierId: string) => `metrics:supplier-nav:${supplierId}:v1`,
  controlPlaneAdminDashboard: "cp:admin-dashboard:v1",
  controlPlaneWarehouseSnapshot: (scope: string, ordersFilter: string) =>
    `cp:warehouse-snapshot:${scope}:${ordersFilter}:v1`,
  controlPlaneInventoryMetrics: "cp:inventory-metrics:v1",
  controlPlaneProductManagerSnapshot: "cp:product-manager:v1",
  controlPlaneProductManagerCatalogMetrics: "cp:product-manager:v1:catalog-metrics",
  controlPlaneSuppliersSnapshot: "cp:suppliers-snapshot:v1",
  controlPlaneCmsCoreSnapshot: "cp:cms-core:v1",
  controlPlaneCmsMarketingSnapshot: "cp:cms-marketing:v1",
  controlPlaneCmsAdvancedSnapshot: "cp:cms-advanced:v1",
  controlPlaneAdminWarehouses: "cp:admin-warehouses:v1",
  controlPlaneAdminWarehousesActive: "cp:admin-warehouses:v1:active",
  controlPlaneAdminEnquiries: (status: string, q: string) => `cp:admin-enquiries:${status}:${q}:v1`,
  controlPlaneAdminReviews: (status: string, productSlug: string, rating: string, q: string) =>
    `cp:admin-reviews:${status}:${productSlug}:${rating}:${q}:v1`,
  controlPlaneAdminBlogPosts: (status: string, q: string) => `cp:admin-blog:${status}:${q}:v1`,
  controlPlaneCsvInventory: (page: number, pageSize: number, catalogFilter: string) =>
    `cp:csv-inventory:${catalogFilter}:${page}:${pageSize}:v1`
} as const;

export const CSV_INVENTORY_CACHE_PREFIX = "cp:csv-inventory:";

export const WAREHOUSE_SNAPSHOT_SCOPES = [
  "full",
  "dashboard",
  "orders",
  "picking",
  "packing",
  "dispatch",
  "transfers",
  "movements",
  "activity",
  "settings"
] as const;

export const WAREHOUSE_ORDERS_FILTERS = ["all", "warehouse"] as const;

export function warehouseSnapshotRedisKeys() {
  return WAREHOUSE_SNAPSHOT_SCOPES.flatMap((scope) =>
    WAREHOUSE_ORDERS_FILTERS.map((ordersFilter) =>
      REDIS_CACHE_KEYS.controlPlaneWarehouseSnapshot(scope, ordersFilter)
    )
  );
}

export async function invalidateControlPlaneRedisCaches(options?: {
  adminDashboard?: boolean;
  warehouseSnapshots?: boolean;
  inventoryMetrics?: boolean;
  navMetrics?: boolean;
  supplierNavMetrics?: boolean;
  productManagerSnapshot?: boolean;
  suppliersSnapshot?: boolean;
  cmsSnapshots?: boolean;
  adminEnquiries?: boolean;
  adminReviews?: boolean;
  adminBlog?: boolean;
  adminWarehouses?: boolean;
  csvInventory?: boolean;
}) {
  const keys: string[] = [];
  if (options?.adminDashboard) keys.push(REDIS_CACHE_KEYS.controlPlaneAdminDashboard);
  if (options?.warehouseSnapshots) keys.push(...warehouseSnapshotRedisKeys());
  if (options?.inventoryMetrics) keys.push(REDIS_CACHE_KEYS.controlPlaneInventoryMetrics);
  if (options?.productManagerSnapshot) {
    keys.push(
      REDIS_CACHE_KEYS.controlPlaneProductManagerSnapshot,
      REDIS_CACHE_KEYS.controlPlaneProductManagerCatalogMetrics
    );
  }
  if (options?.suppliersSnapshot) keys.push(REDIS_CACHE_KEYS.controlPlaneSuppliersSnapshot);
  if (options?.cmsSnapshots) {
    keys.push(
      REDIS_CACHE_KEYS.controlPlaneCmsCoreSnapshot,
      REDIS_CACHE_KEYS.controlPlaneCmsMarketingSnapshot,
      REDIS_CACHE_KEYS.controlPlaneCmsAdvancedSnapshot
    );
  }
  if (options?.adminWarehouses) {
    keys.push(
      REDIS_CACHE_KEYS.controlPlaneAdminWarehouses,
      REDIS_CACHE_KEYS.controlPlaneAdminWarehousesActive
    );
  }
  if (options?.navMetrics) {
    keys.push(REDIS_CACHE_KEYS.adminNavMetrics, REDIS_CACHE_KEYS.warehouseNavMetrics);
  }

  // Independent Redis invalidations run in parallel so a single slow KEYS/DEL
  // cannot serialize the entire mutation revalidation path to 10–20s.
  const tasks: Promise<void>[] = [];
  if (keys.length) tasks.push(deleteCachedKeys(keys));
  if (options?.supplierNavMetrics) tasks.push(invalidateSupplierNavMetricCaches());
  if (options?.adminEnquiries) tasks.push(invalidateRedisKeyPattern("cp:admin-enquiries:"));
  if (options?.adminReviews) tasks.push(invalidateRedisKeyPattern("cp:admin-reviews:"));
  if (options?.adminBlog) tasks.push(invalidateRedisKeyPattern("cp:admin-blog:"));
  if (options?.csvInventory) tasks.push(invalidateRedisKeyPattern(CSV_INVENTORY_CACHE_PREFIX));

  if (!tasks.length) return;

  const startedAt = Date.now();
  await Promise.all(tasks);
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs >= 500) {
    console.warn(`[mithron-cache] invalidateControlPlaneRedisCaches took ${elapsedMs}ms`);
  }
}

export async function invalidateRedisKeyPattern(prefix: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  const match = `${prefix}*`;
  const deadlineAt = Date.now() + 4_000;
  const maxIterations = 10;

  try {
    let cursor: string | number = 0;
    for (let i = 0; i < maxIterations; i++) {
      if (Date.now() > deadlineAt) break;

      const page = (await withRedisTimeout(
        `SCAN ${match} (iter ${i + 1}/${maxIterations})`,
        () => redis.scan(cursor, { match, count: 200 })
      )) as [string, string[]];
      const nextCursor = page[0];
      const keys = page[1];

      if (Array.isArray(keys) && keys.length) {
        await withRedisTimeout(`DEL SCAN batch (${keys.length}) for ${match}`, () => redis.del(...keys));
      }

      cursor = nextCursor;
      if (String(cursor) === "0") break;
    }
  } catch (error) {
    console.warn(`[mithron-cache] Redis pattern invalidation failed for ${prefix}.`, error);
  }
}

export async function invalidateSupplierNavMetricCaches() {
  const redis = getRedisClient();
  if (!redis) return;
  const match = "metrics:supplier-nav:*";
  const deadlineAt = Date.now() + 4_000;
  const maxIterations = 10;

  try {
    let cursor: string | number = 0;
    for (let i = 0; i < maxIterations; i++) {
      if (Date.now() > deadlineAt) break;

      const page = (await withRedisTimeout(
        `SCAN ${match} (iter ${i + 1}/${maxIterations})`,
        () => redis.scan(cursor, { match, count: 200 })
      )) as [string, string[]];
      const nextCursor = page[0];
      const keys = page[1];

      if (Array.isArray(keys) && keys.length) {
        await withRedisTimeout(`DEL SCAN batch (${keys.length}) for ${match}`, () => redis.del(...keys));
      }

      cursor = nextCursor;
      if (String(cursor) === "0") break;
    }
  } catch (error) {
    console.warn("[mithron-cache] Redis supplier nav metrics invalidation failed.", error);
  }
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const value = await withRedisTimeout(`GET ${key}`, () => redis.get<T>(key));
      return value ?? null;
    } catch (error) {
      lastError = error;
      const timedOut = error instanceof Error && /timed out/i.test(error.message);
      if (!timedOut || attempt === 2) break;
    }
  }
  console.warn(`[mithron-cache] Redis GET failed for ${key}.`, lastError);
  return null;
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await withRedisTimeout(
      `SET ${key}`,
      () => redis.set(key, value, { ex: Math.max(1, ttlSeconds) })
    );
  } catch (error) {
    console.warn(`[mithron-cache] Redis SET failed for ${key}.`, error);
  }
}

export async function deleteCachedKeys(keys: string[]): Promise<void> {
  const redis = getRedisClient();
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  if (!redis || !uniqueKeys.length) return;
  try {
    await withRedisTimeout(`DEL ${uniqueKeys.length} keys`, () => redis.del(...uniqueKeys));
  } catch (error) {
    console.warn(`[mithron-cache] Redis DEL failed for ${uniqueKeys.join(", ")}.`, error);
  }
}

export async function acquireRedisLock(key: string, ttlSeconds: number): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return true;
  try {
    const result = await withRedisTimeout(
      `LOCK ${key}`,
      () => redis.set(key, "1", { nx: true, ex: Math.max(1, ttlSeconds) })
    );
    return result === "OK";
  } catch (error) {
    console.warn(`[mithron-cache] Redis lock acquire failed for ${key}; proceeding fail-open.`, error);
    return true;
  }
}

export type RedisLockOutcome = "acquired" | "held" | "unavailable";

/**
 * Strict lock acquisition for jobs that must never double-run (e.g. Vercel
 * crons). Unlike acquireRedisLock (which fails open on error to keep
 * best-effort caches unblocked), this distinguishes three states:
 * - `acquired`: lock is now held by this caller (or Redis isn't configured in
 *   non-production — single-instance local/dev is safe to proceed).
 * - `held`: another instance already holds the lock — skip.
 * - `unavailable`: Redis is not configured in production, or the backend
 *   errored — the caller should fail closed.
 */
export async function acquireRedisLockStrict(key: string, ttlSeconds: number): Promise<RedisLockOutcome> {
  const redis = getRedisClient();
  if (!redis) {
    return isProductionRuntime() ? "unavailable" : "acquired";
  }
  try {
    const result = await withRedisTimeout(
      `LOCK_STRICT ${key}`,
      () => redis.set(key, "1", { nx: true, ex: Math.max(1, ttlSeconds) })
    );
    return result === "OK" ? "acquired" : "held";
  } catch (error) {
    console.error(`[mithron-cache] Redis lock backend unavailable for ${key}; failing closed.`, error);
    return "unavailable";
  }
}

/**
 * Owner-token lock: stores a random UUID so only the holder can release.
 * Fails open when Redis is unavailable (same as acquireRedisLock) for
 * best-effort cache single-flight / non-cron use.
 */
export async function acquireRedisLockWithOwner(
  key: string,
  ttlSeconds: number
): Promise<{ acquired: boolean; token: string | null }> {
  const redis = getRedisClient();
  const token = randomUUID();
  if (!redis) return { acquired: true, token };
  try {
    const result = await withRedisTimeout(
      `LOCK_OWNED ${key}`,
      () => redis.set(key, token, { nx: true, ex: Math.max(1, ttlSeconds) })
    );
    return result === "OK" ? { acquired: true, token } : { acquired: false, token: null };
  } catch (error) {
    console.warn(`[mithron-cache] Redis owned lock acquire failed for ${key}; proceeding fail-open.`, error);
    return { acquired: true, token };
  }
}

/**
 * Strict owned-lock variant for cron jobs: fail-closed on missing/errored Redis
 * in production, and returns the owner token for safe release.
 */
export async function acquireRedisLockStrictOwned(
  key: string,
  ttlSeconds: number
): Promise<{ outcome: RedisLockOutcome; token: string | null }> {
  const redis = getRedisClient();
  if (!redis) {
    return {
      outcome: isProductionRuntime() ? "unavailable" : "acquired",
      token: null
    };
  }
  const token = randomUUID();
  try {
    const result = await withRedisTimeout(
      `LOCK_STRICT_OWNED ${key}`,
      () => redis.set(key, token, { nx: true, ex: Math.max(1, ttlSeconds) })
    );
    return result === "OK"
      ? { outcome: "acquired", token }
      : { outcome: "held", token: null };
  } catch (error) {
    console.error(`[mithron-cache] Redis owned lock backend unavailable for ${key}; failing closed.`, error);
    return { outcome: "unavailable", token: null };
  }
}

export async function releaseRedisLock(key: string): Promise<void> {
  await deleteCachedKeys([key]);
}

/** Delete a lock key only when the stored value matches the owner token. */
export async function releaseRedisLockOwned(key: string, token: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis || !token) return;
  try {
    const current = await withRedisTimeout(`LOCK_OWNED_GET ${key}`, () => redis.get<string>(key));
    if (current === token) {
      await withRedisTimeout(`LOCK_OWNED_DEL ${key}`, () => redis.del(key));
    }
  } catch (error) {
    console.warn(`[mithron-cache] Redis owned lock release failed for ${key}.`, error);
  }
}

export async function setCooldownKey(key: string, ttlSeconds: number): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    const result = await withRedisTimeout(
      `COOLDOWN_SET ${key}`,
      () => redis.set(key, "1", { nx: true, ex: Math.max(1, ttlSeconds) })
    );
    return result !== "OK";
  } catch (error) {
    console.warn(`[mithron-cache] Redis cooldown set failed for ${key}.`, error);
    return false;
  }
}

export async function hasCooldownKey(key: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    const value = await withRedisTimeout(`COOLDOWN_GET ${key}`, () => redis.get(key));
    return value != null;
  } catch (error) {
    console.warn(`[mithron-cache] Redis cooldown check failed for ${key}.`, error);
    return false;
  }
}

/**
 * Redis-backed single-flight: only one instance runs `loader` on a cold miss.
 * Waiters poll the cache briefly instead of stampeding. If Redis is unavailable,
 * acquireRedisLock fails open and every caller loads independently.
 */
export async function withSingleFlight<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = await getCachedJson<T>(key);
  if (cached != null) return cached;

  const lockKey = `lock:sf:${key}`;
  const gotLock = await acquireRedisLock(lockKey, SINGLE_FLIGHT_LOCK_TTL_SECONDS);
  if (gotLock) {
    try {
      const lockedCached = await getCachedJson<T>(key);
      if (lockedCached != null) return lockedCached;
      const value = await loader();
      await setCachedJson(key, value, ttlSeconds);
      return value;
    } finally {
      await releaseRedisLock(lockKey);
    }
  }

  const deadlineAt = Date.now() + SINGLE_FLIGHT_WAIT_BUDGET_MS;
  while (Date.now() < deadlineAt) {
    const waited = await getCachedJson<T>(key);
    if (waited != null) return waited;
    await wait(150 + Math.random() * 150);
  }

  // Lock holder is taking too long — load directly rather than block forever.
  return loader();
}

export async function readThroughCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  return withSingleFlight(key, ttlSeconds, loader);
}
