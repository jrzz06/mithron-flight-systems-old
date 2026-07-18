import { Ratelimit } from "@upstash/ratelimit";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminConfig } from "@/lib/env";
import { supabaseFetch } from "@/lib/fetch-with-timeout";
import { getRedisClient, withRedisTimeout } from "@/lib/redis-client";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
  degraded?: boolean;
};

/**
 * Behaviour when both Upstash Redis and the Postgres fallback are unavailable
 * in production.
 * - `fail_closed` (default): deny the request. Correct for abuse-sensitive
 *   surfaces (auth, checkout, payments/webhooks, bearer, AI) where allowing
 *   unbounded traffic during a backend outage is worse than a transient 429.
 * - `fail_open`: allow the request. Reserved for low-risk endpoints that must
 *   not 500/429 when the limiter backend is degraded.
 */
export type RateLimitDegradedMode = "fail_closed" | "fail_open";

let warnedAboutInMemoryRateLimit = false;
let warnedAboutPostgresFallback = false;

type RateLimitRpcRow = {
  allowed: boolean;
  remaining?: number;
  retry_after_ms?: number;
};

type RateLimitSupabaseClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: RateLimitRpcRow | RateLimitRpcRow[] | null; error: { message: string } | null }>;
};

let serviceRoleClient: RateLimitSupabaseClient | null | undefined;

// Bracket access avoids Vite/Next statically inlining `process.env.NODE_ENV`,
// so the production degraded-mode branch can be exercised in tests via
// vi.stubEnv while behaving identically at runtime.
function isProductionRuntime() {
  return process.env["NODE_ENV"] === "production";
}

const rateLimiterCache = new Map<string, Ratelimit>();

function warnInMemoryRateLimitFallback() {
  if (warnedAboutInMemoryRateLimit) return;
  warnedAboutInMemoryRateLimit = true;
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[mithron] ALARM: in-memory rate-limit fallback invoked in production — distributed limits are broken; requests must fail closed."
    );
    return;
  }
  console.warn(
    "[mithron] Distributed rate limiting unavailable — falling back to in-memory counters (dev/test only; not shared across instances)."
  );
}

function warnPostgresFallback() {
  if (warnedAboutPostgresFallback || process.env.NODE_ENV !== "production") return;
  warnedAboutPostgresFallback = true;
  console.warn(
    "[mithron] Upstash Redis not configured — using Postgres auth_rate_limit_buckets for distributed rate limiting."
  );
}

function applyInMemoryFallback(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  warnInMemoryRateLimitFallback();
  return checkRateLimit(key, maxRequests, windowMs);
}

function createServiceRoleClient() {
  if (serviceRoleClient !== undefined) return serviceRoleClient;
  const config = getSupabaseAdminConfig();
  if (!config.configured) {
    serviceRoleClient = null;
    return null;
  }
  serviceRoleClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: supabaseFetch() }
  }) as unknown as RateLimitSupabaseClient;
  return serviceRoleClient;
}

async function bumpPostgresRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  warnPostgresFallback();
  const { data, error } = await supabase.rpc("bump_auth_rate_limit", {
    p_key: key,
    p_max: maxRequests,
    p_window_ms: windowMs
  });

  if (error) {
    console.warn("[mithron] Postgres rate limit bump failed.", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== "boolean") {
    return null;
  }

  return {
    allowed: row.allowed,
    remaining: Number(row.remaining ?? 0),
    retryAfterMs: row.allowed ? undefined : Number(row.retry_after_ms ?? windowMs)
  };
}

async function peekPostgresRateLimit(key: string, maxRequests: number): Promise<RateLimitResult | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("peek_auth_rate_limit", {
    p_key: key,
    p_max: maxRequests
  });

  if (error) {
    console.warn("[mithron] Postgres rate limit peek failed.", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== "boolean") {
    return null;
  }

  return {
    allowed: row.allowed,
    remaining: Number(row.remaining ?? 0)
  };
}

async function clearPostgresRateLimit(key: string): Promise<void> {
  const supabase = createServiceRoleClient();
  if (!supabase) return;
  await supabase.rpc("clear_auth_rate_limit", { p_key: key });
}

/**
 * Pure resolution of the result when no rate-limit backend is reachable in
 * production. Exported for direct testing of the fail-closed/fail-open contract.
 */
export function degradedRateLimitResult(
  degradedMode: RateLimitDegradedMode,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  if (degradedMode === "fail_open") {
    return { allowed: true, remaining: maxRequests, degraded: true };
  }
  return { allowed: false, remaining: 0, retryAfterMs: Math.max(1_000, windowMs), degraded: true };
}

function logDegraded(degradedMode: RateLimitDegradedMode, error?: unknown) {
  if (degradedMode === "fail_open") {
    console.warn("[mithron] Distributed rate limiting unavailable — allowing request (fail-open).", error ?? "");
  } else {
    console.error("[mithron] Distributed rate limiting unavailable — denying request (fail-closed).", error ?? "");
  }
}

function getRateLimiter(maxRequests: number, windowMs: number): Ratelimit | null {
  const redis = getRedisClient();
  if (!redis) return null;

  const cacheKey = `${maxRequests}:${windowMs}`;
  let limiter = rateLimiterCache.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(maxRequests, `${Math.max(1, windowMs)} ms`),
      prefix: "ratelimit",
      analytics: false
    });
    rateLimiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

function mapRateLimitResponse(
  success: boolean,
  remaining: number,
  reset: number,
  maxRequests: number
): RateLimitResult {
  if (!success) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, reset - Date.now())
    };
  }
  return {
    allowed: true,
    remaining: Math.max(0, remaining)
  };
}

export async function checkDistributedRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  degradedMode: RateLimitDegradedMode = "fail_closed"
): Promise<RateLimitResult> {
  const limiter = getRateLimiter(maxRequests, windowMs);
  if (!limiter) {
    const postgres = await bumpPostgresRateLimit(key, maxRequests, windowMs);
    if (postgres) return postgres;
    if (isProductionRuntime()) {
      logDegraded(degradedMode);
      return degradedRateLimitResult(degradedMode, maxRequests, windowMs);
    }
    return applyInMemoryFallback(key, maxRequests, windowMs);
  }

  try {
    const result = await withRedisTimeout(`RATE_LIMIT ${key}`, () => limiter.limit(key));
    return mapRateLimitResponse(result.success, result.remaining, result.reset, maxRequests);
  } catch (error) {
    const postgres = await bumpPostgresRateLimit(key, maxRequests, windowMs);
    if (postgres) return { ...postgres, degraded: true };
    if (isProductionRuntime()) {
      logDegraded(degradedMode, error);
      return degradedRateLimitResult(degradedMode, maxRequests, windowMs);
    }
    return applyInMemoryFallback(key, maxRequests, windowMs);
  }
}

export async function deleteDistributedRateLimitKey(key: string): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const limiter = getRateLimiter(1, 60_000);
      if (limiter) {
        await withRedisTimeout(`RATE_LIMIT_RESET ${key}`, () => limiter.resetUsedTokens(key));
        return;
      }
    } catch {
      // Fall through to Postgres clear.
    }
  }

  await clearPostgresRateLimit(key).catch(() => undefined);
}

export async function peekDistributedRateLimit(
  key: string,
  maxRequests: number,
  windowMs = 60_000
): Promise<RateLimitResult> {
  const limiter = getRateLimiter(maxRequests, windowMs);
  if (!limiter) {
    const postgres = await peekPostgresRateLimit(key, maxRequests);
    if (postgres) return postgres;
    if (isProductionRuntime()) {
      logDegraded("fail_closed");
      return degradedRateLimitResult("fail_closed", maxRequests, windowMs);
    }
    return applyInMemoryFallback(key, maxRequests, windowMs);
  }

  try {
    const result = await withRedisTimeout(`RATE_LIMIT_PEEK ${key}`, () => limiter.getRemaining(key));
    if (result.remaining <= 0) {
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: Math.max(0, result.remaining) };
  } catch (error) {
    if (isProductionRuntime()) {
      logDegraded("fail_closed", error);
      return degradedRateLimitResult("fail_closed", maxRequests, windowMs);
    }
    return { allowed: true, remaining: maxRequests };
  }
}

export async function peekDistributedRateLimits(
  entries: Array<{ key: string; maxRequests: number; windowMs?: number }>
): Promise<RateLimitResult[]> {
  return Promise.all(
    entries.map((entry) => peekDistributedRateLimit(entry.key, entry.maxRequests, entry.windowMs))
  );
}

export async function checkDistributedRateLimits(
  entries: Array<{ key: string; maxRequests: number; windowMs: number }>
): Promise<RateLimitResult[]> {
  if (!entries.length) return [];
  const redis = getRedisClient();
  if (!redis) {
    return Promise.all(entries.map((entry) => checkDistributedRateLimit(entry.key, entry.maxRequests, entry.windowMs)));
  }

  return Promise.all(entries.map((entry) => checkDistributedRateLimit(entry.key, entry.maxRequests, entry.windowMs)));
}
