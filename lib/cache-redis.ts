import { randomUUID } from "node:crypto";
import { getRedisClient, withRedisTimeout, REDIS_CACHE_READ_TIMEOUT_MS, REDIS_CACHE_WRITE_TIMEOUT_MS } from "@/lib/redis-client";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";

const SINGLE_FLIGHT_LOCK_TTL_SECONDS = 8;
const SINGLE_FLIGHT_WAIT_BUDGET_MS = 6_000;
/** Extra wait for waiters after a single fallback loader is elected. */
const SINGLE_FLIGHT_FALLBACK_WAIT_MS = 4_000;
const SINGLE_FLIGHT_HEARTBEAT_MS = 2_500;
/** Wall-clock cap for the lock-holder loader (waiters already have budgets). */
const SINGLE_FLIGHT_LOADER_TIMEOUT_MS = 12_000;
/**
 * Composite homepage cold-miss (CMS + catalog media + blog/press) routinely
 * exceeds the default 12s cap when Redis RTTs are elevated or Supabase is cold.
 */
export const HOMEPAGE_SINGLE_FLIGHT_LOADER_TIMEOUT_MS = 25_000;

export type SingleFlightOptions = {
  /** Override the default lock-holder loader wall-clock cap. */
  loaderTimeoutMs?: number;
};

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
  catalogSearchQuery: (query: string, limit: number) =>
    `catalog:search-q:${query.toLowerCase()}:${limit}:v1`,
  catalogCartSuggestions: "catalog:cart-suggestions:v1",
  catalogCartPricing: (fingerprint: string) => `catalog:cart-pricing:${fingerprint}:v1`,
  catalogProductRow: (slug: string) => `catalog:product-row:${slug}:v1`,
  categoryOptions: "catalog:category-options:v1",
  cmsHomepage: "cms:homepage:v1",
  cmsShell: "cms:shell:v1",
  cmsHero: "cms:hero:v1",
  productCore: (slug: string) => `product:core:${slug}`,
  productReviews: (slug: string, sort: string) => `product:reviews:${slug}:${sort}:v1`,
  productRelated: (slug: string, limit: number) => `product:related:${slug}:${limit}:v1`,
  authRoleContext: (userId: string, sessionIat: number) => `auth:role:${userId}:${sessionIat}`,
  authRoleContextPrefix: (userId: string) => `auth:role:${userId}:`,
  adminNavMetrics: "metrics:admin-nav:v1",
  warehouseNavMetrics: "metrics:warehouse-nav:v1",
  supplierNavMetrics: (supplierId: string) => `metrics:supplier-nav:${supplierId}:v1`,
  controlPlaneAdminDashboard: "cp:admin-dashboard:v1",
  controlPlaneWarehouseSnapshot: (
    scope: string,
    ordersFilter: string,
    limit = 80,
    offset = 0,
    status = "all"
  ) =>
    `cp:warehouse-snapshot:${scope}:${ordersFilter}:v2:${limit}:${offset}:${status}`,
  controlPlaneInventoryMetrics: "cp:inventory-metrics:v1",
  controlPlaneProductManagerSnapshot: "cp:product-manager:v3",
  controlPlaneProductManagerList: (
    limit: number,
    offset: number,
    workflowStatus: string,
    q: string
  ) => `cp:product-manager:v3:${limit}:${offset}:${workflowStatus}:${q}`,
  controlPlaneProductManagerCatalogMetrics: "cp:product-manager:v3:catalog-metrics",
  controlPlaneSuppliersSnapshot: "cp:suppliers-snapshot:v1",
  controlPlaneCmsCoreSnapshot: "cp:cms-core:v1",
  controlPlaneCmsMarketingSnapshot: "cp:cms-marketing:v1",
  controlPlaneCmsAdvancedSnapshot: "cp:cms-advanced:v1",
  controlPlaneAdminWarehouses: "cp:admin-warehouses:v1",
  controlPlaneAdminWarehousesActive: "cp:admin-warehouses:v1:active",
  controlPlaneAdminEnquiries: (status: string, q: string) => `cp:admin-enquiries:${status}:${q}:v1`,
  controlPlaneAuditObservability: "cp:audit-observability:v1",
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
  // Default pagination key only — custom limit/offset/status keys share the same prefix and are
  // cleared via pattern invalidation in invalidateControlPlaneRedisCaches.
  return WAREHOUSE_SNAPSHOT_SCOPES.flatMap((scope) =>
    WAREHOUSE_ORDERS_FILTERS.map((ordersFilter) =>
      REDIS_CACHE_KEYS.controlPlaneWarehouseSnapshot(scope, ordersFilter)
    )
  );
}

const WAREHOUSE_SNAPSHOT_CACHE_PREFIX = "cp:warehouse-snapshot:";

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
  if (options?.warehouseSnapshots) tasks.push(invalidateRedisKeyPattern(WAREHOUSE_SNAPSHOT_CACHE_PREFIX));
  if (options?.productManagerSnapshot) tasks.push(invalidateRedisKeyPattern("cp:product-manager:"));
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
  try {
    // Single attempt with a short budget — retrying a timed-out GET doubles TTFB
    // when Upstash is region-mismatched (production observed 500–1700ms RTTs).
    const value = await withRedisTimeout(
      `GET ${key}`,
      () => redis.get<T>(key),
      REDIS_CACHE_READ_TIMEOUT_MS
    );
    return value ?? null;
  } catch (error) {
    console.warn(`[mithron-cache] Redis GET failed for ${key}.`, error);
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await withRedisTimeout(
      `SET ${key}`,
      () => redis.set(key, value, { ex: Math.max(1, ttlSeconds) }),
      REDIS_CACHE_WRITE_TIMEOUT_MS
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

/** Compare-and-delete: only the owner token may release the lock (atomic Lua). */
const RELEASE_OWNED_LOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/** Extend lock TTL only when the owner token still holds the key. */
const RENEW_OWNED_LOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return 0
`;

/** Delete a lock key only when the stored value matches the owner token. */
export async function releaseRedisLockOwned(key: string, token: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis || !token) return;
  try {
    await withRedisTimeout(
      `LOCK_OWNED_CAS_DEL ${key}`,
      () => redis.eval(RELEASE_OWNED_LOCK_LUA, [key], [token])
    );
  } catch (error) {
    console.warn(`[mithron-cache] Redis owned lock release failed for ${key}.`, error);
  }
}

/** Heartbeat: refresh owned lock TTL so slow loaders do not expire mid-flight. */
export async function renewRedisLockOwned(
  key: string,
  token: string,
  ttlSeconds: number
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis || !token) return false;
  try {
    const result = await withRedisTimeout(
      `LOCK_OWNED_RENEW ${key}`,
      () =>
        redis.eval(
          RENEW_OWNED_LOCK_LUA,
          [key],
          [token, String(Math.max(1, ttlSeconds))]
        )
    );
    return Number(result) === 1;
  } catch (error) {
    console.warn(`[mithron-cache] Redis owned lock renew failed for ${key}.`, error);
    return false;
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
 *
 * Under flood, waiters must NOT all call `loader()` after the wait budget —
 * that thundering herd previously drove multi-GB RSS hangs. Instead elect a
 * single fallback loader via a short secondary lock; others keep polling.
 */
export async function withSingleFlight<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  options?: SingleFlightOptions
): Promise<T> {
  const loaderTimeoutMs =
    Number.isFinite(options?.loaderTimeoutMs) && (options?.loaderTimeoutMs ?? 0) > 0
      ? Math.floor(options!.loaderTimeoutMs!)
      : SINGLE_FLIGHT_LOADER_TIMEOUT_MS;

  const cached = await getCachedJson<T>(key);
  if (cached != null) return cached;

  const lockKey = `lock:sf:${key}`;
  const { acquired, token } = await acquireRedisLockWithOwner(lockKey, SINGLE_FLIGHT_LOCK_TTL_SECONDS);
  if (acquired) {
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      const lockedCached = await getCachedJson<T>(key);
      if (lockedCached != null) return lockedCached;
      if (token) {
        heartbeat = setInterval(() => {
          void renewRedisLockOwned(lockKey, token, SINGLE_FLIGHT_LOCK_TTL_SECONDS);
        }, SINGLE_FLIGHT_HEARTBEAT_MS);
        // Unref so heartbeats cannot keep the event loop alive in Node.
        if (typeof heartbeat.unref === "function") heartbeat.unref();
      }
      const value = await raceWithTimeout(
        loader(),
        loaderTimeoutMs,
        `single-flight:${key}`
      );
      await setCachedJson(key, value, ttlSeconds);
      return value;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      if (token) {
        await releaseRedisLockOwned(lockKey, token);
      } else {
        await releaseRedisLock(lockKey);
      }
    }
  }

  const deadlineAt = Date.now() + SINGLE_FLIGHT_WAIT_BUDGET_MS;
  while (Date.now() < deadlineAt) {
    const waited = await getCachedJson<T>(key);
    if (waited != null) return waited;
    await wait(150 + Math.random() * 150);
  }

  // One more cache read — lock holder may have just written.
  const lateCached = await getCachedJson<T>(key);
  if (lateCached != null) return lateCached;

  // Elect a single fallback loader instead of N parallel loaders.
  const fallbackLockKey = `lock:sf:fb:${key}`;
  const fallback = await acquireRedisLockWithOwner(fallbackLockKey, SINGLE_FLIGHT_LOCK_TTL_SECONDS);
  if (fallback.acquired) {
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      const again = await getCachedJson<T>(key);
      if (again != null) return again;
      if (fallback.token) {
        heartbeat = setInterval(() => {
          void renewRedisLockOwned(fallbackLockKey, fallback.token!, SINGLE_FLIGHT_LOCK_TTL_SECONDS);
        }, SINGLE_FLIGHT_HEARTBEAT_MS);
        if (typeof heartbeat.unref === "function") heartbeat.unref();
      }
      const value = await raceWithTimeout(
        loader(),
        loaderTimeoutMs,
        `single-flight-fallback:${key}`
      );
      await setCachedJson(key, value, ttlSeconds);
      return value;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      if (fallback.token) {
        await releaseRedisLockOwned(fallbackLockKey, fallback.token);
      } else {
        await releaseRedisLock(fallbackLockKey);
      }
    }
  }

  const fallbackDeadline = Date.now() + SINGLE_FLIGHT_FALLBACK_WAIT_MS;
  while (Date.now() < fallbackDeadline) {
    const waited = await getCachedJson<T>(key);
    if (waited != null) return waited;
    await wait(150 + Math.random() * 150);
  }

  const finalCached = await getCachedJson<T>(key);
  if (finalCached != null) return finalCached;

  // Last resort: load once. Prefer this over hanging forever; stampede risk is
  // already greatly reduced by the two lock stages above.
  return raceWithTimeout(loader(), loaderTimeoutMs, `single-flight-last:${key}`);
}

export async function readThroughCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  options?: SingleFlightOptions
): Promise<T> {
  return withSingleFlight(key, ttlSeconds, loader, options);
}
