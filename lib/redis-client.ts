import { AsyncLocalStorage } from "node:async_hooks";
import https from "node:https";
import { Redis, type Requester } from "@upstash/redis";

let redisClient: Redis | null | undefined;

/**
 * Cap every Redis REST call so a degraded Upstash endpoint cannot stall
 * mutations. 4s leaves headroom for cold HTTPS handshakes (~0.5–1s observed)
 * while still failing fast vs unbounded hangs.
 *
 * Cache reads use a short budget so a slow Redis region cannot dominate TTFB —
 * miss → fall through to Supabase immediately (fail-open for app-data caches).
 *
 * Region note: co-locate Upstash with the app (e.g. both `ap-south-1`). Cross-region
 * REST RTTs of 500–1700ms make Redis slower than Supabase — fail-fast below.
 */
export const REDIS_OP_TIMEOUT_MS = 4_000;
/**
 * Best-effort catalog/CMS GET. Prefer Supabase over waiting on a slow Redis RTT.
 * 250ms is enough for co-located REST; region-mismatched Upstash fails open fast.
 */
export const REDIS_CACHE_READ_TIMEOUT_MS = 250;
/** Best-effort cache SET — do not block SSR on write amplification. */
export const REDIS_CACHE_WRITE_TIMEOUT_MS = 800;
/**
 * Single-flight / cache locks must fail open fast. A 4s lock RTT on mismatched
 * Upstash previously dominated homepage TTFB (many LOCK+SET+DEL per request).
 */
export const REDIS_CACHE_LOCK_TIMEOUT_MS = 300;
/** Health probe — long enough for warm RTT, short enough to fail the cron. */
export const REDIS_HEALTH_PING_TIMEOUT_MS = 3_000;

/** After this many consecutive Redis timeouts, skip Redis for a cooldown. */
const REDIS_CIRCUIT_OPEN_AFTER = 3;
/** How long to bypass Redis once the circuit opens (L1 + Supabase only). */
const REDIS_CIRCUIT_COOLDOWN_MS = 30_000;

let redisConsecutiveTimeouts = 0;
let redisCircuitOpenUntil = 0;
let redisCircuitLoggedUntil = 0;

/** True while Upstash is degraded — callers should skip Redis and use L1/loader. */
export function isRedisCircuitOpen() {
  return Date.now() < redisCircuitOpenUntil;
}

export function getRedisCircuitOpenRemainingMs() {
  return Math.max(0, redisCircuitOpenUntil - Date.now());
}

/** Test helper — reset circuit state between cases. */
export function resetRedisCircuitForTests() {
  redisConsecutiveTimeouts = 0;
  redisCircuitOpenUntil = 0;
  redisCircuitLoggedUntil = 0;
}

function noteRedisTimeoutForCircuit() {
  redisConsecutiveTimeouts += 1;
  if (redisConsecutiveTimeouts < REDIS_CIRCUIT_OPEN_AFTER) return;
  redisCircuitOpenUntil = Date.now() + REDIS_CIRCUIT_COOLDOWN_MS;
  redisConsecutiveTimeouts = 0;
  if (redisCircuitOpenUntil !== redisCircuitLoggedUntil) {
    redisCircuitLoggedUntil = redisCircuitOpenUntil;
    console.warn(
      `[mithron-cache] Redis circuit open for ${REDIS_CIRCUIT_COOLDOWN_MS}ms — skipping Upstash (L1 + origin only)`
    );
  }
}

function noteRedisSuccessForCircuit() {
  redisConsecutiveTimeouts = 0;
}

/** Rolling counters for ops dashboards / logs (process lifetime). */
export type RedisTimingStats = {
  hits: number;
  misses: number;
  timeouts: number;
  errors: number;
  samples: number;
  totalMs: number;
  maxMs: number;
  /** Histogram buckets: &lt;50, &lt;100, &lt;250, &lt;500, ≥500 ms */
  buckets: [number, number, number, number, number];
};

const redisTimingStats: RedisTimingStats = {
  hits: 0,
  misses: 0,
  timeouts: 0,
  errors: 0,
  samples: 0,
  totalMs: 0,
  maxMs: 0,
  buckets: [0, 0, 0, 0, 0]
};

let redisRegionLogged = false;

export function getRedisTimingStats(): Readonly<RedisTimingStats> {
  return { ...redisTimingStats, buckets: [...redisTimingStats.buckets] };
}

export function recordRedisCacheHit() {
  redisTimingStats.hits += 1;
}

export function recordRedisCacheMiss() {
  redisTimingStats.misses += 1;
}

function recordRedisSample(elapsedMs: number, timedOut: boolean, errored: boolean) {
  redisTimingStats.samples += 1;
  redisTimingStats.totalMs += elapsedMs;
  if (elapsedMs > redisTimingStats.maxMs) redisTimingStats.maxMs = elapsedMs;
  if (timedOut) redisTimingStats.timeouts += 1;
  if (errored) redisTimingStats.errors += 1;
  if (elapsedMs < 50) redisTimingStats.buckets[0] += 1;
  else if (elapsedMs < 100) redisTimingStats.buckets[1] += 1;
  else if (elapsedMs < 250) redisTimingStats.buckets[2] += 1;
  else if (elapsedMs < 500) redisTimingStats.buckets[3] += 1;
  else redisTimingStats.buckets[4] += 1;
}

/** Log Upstash host once so region mismatches are visible in production logs. */
export function logRedisEndpointRegionOnce() {
  if (redisRegionLogged) return;
  redisRegionLogged = true;
  const credentials = getRedisRestCredentials();
  if (!credentials) {
    console.info("[mithron-cache] Redis not configured — catalog/CMS caches fall through to Supabase");
    return;
  }
  try {
    const host = new URL(credentials.url).hostname;
    console.info(
      `[mithron-cache] Redis endpoint host=${host} readTimeout=${REDIS_CACHE_READ_TIMEOUT_MS}ms writeTimeout=${REDIS_CACHE_WRITE_TIMEOUT_MS}ms (co-locate Upstash with the app region)`
    );
  } catch {
    console.info("[mithron-cache] Redis configured (host parse failed)");
  }
}

const redisAbortStore = new AsyncLocalStorage<AbortController>();

const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  maxFreeSockets: 16,
  scheduling: "lifo"
});

/**
 * Vercel / dotenv sometimes stores secrets wrapped in quotes
 * (`"https://….upstash.io"`). Those quotes break `new URL()` inside the
 * Upstash HTTPS transport, so Redis never connects and auth-role cache
 * never warms (`usedAuthRoleCache: false`). Strip only surrounding quotes.
 */
export function normalizeRedisEnvValue(raw: string | undefined | null): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function getRedisRestCredentials() {
  const url = normalizeRedisEnvValue(
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  );
  const token = normalizeRedisEnvValue(
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  );
  if (!url || !token) return null;
  if (/deploy-placeholder\.upstash\.io/i.test(url)) return null;
  try {
    // Reject quote-broken / malformed URLs before constructing the client.
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  } catch {
    return null;
  }
  return { url, token };
}

export function isRedisConfigured() {
  return getRedisRestCredentials() !== null;
}

type UpstashRestRequest = {
  path?: string[];
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

type UpstashRestResponse<TResult> = {
  result?: TResult;
  error?: string;
};

/**
 * Node https-based Upstash REST transport.
 *
 * Critical for storefront ISR/SSG: the default @upstash/redis client uses
 * global `fetch({ cache: "no-store" })`, which Next.js App Router treats as a
 * dynamic data dependency and forces every route that touches Redis (including
 * the storefront shell layout) into full dynamic rendering. Speaking HTTPS
 * directly bypasses Next's fetch instrumentation while preserving Redis TTLs.
 */
function createUpstashHttpsRequester(baseUrl: string, token: string): Requester {
  const normalizedBase = baseUrl.replace(/\/$/, "");

  return {
    async request<TResult>(req: UpstashRestRequest): Promise<UpstashRestResponse<TResult>> {
      const requestUrl = [normalizedBase, ...(req.path ?? [])].join("/");
      const payload = JSON.stringify(req.body ?? null);
      const url = new URL(requestUrl);
      const signal = req.signal ?? redisAbortStore.getStore()?.signal ?? undefined;

      const rawBody = await new Promise<string>((resolve, reject) => {
        const request = https.request(
          {
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || undefined,
            path: `${url.pathname}${url.search}`,
            method: "POST",
            agent: keepAliveAgent,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/json",
              "Content-Length": Buffer.byteLength(payload),
              ...(req.headers ?? {})
            }
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk) => {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            response.on("end", () => {
              const text = Buffer.concat(chunks).toString("utf8");
              const status = response.statusCode ?? 500;
              if (status >= 400) {
                reject(new Error(`[mithron-cache] Upstash Redis HTTP ${status}: ${text}`));
                return;
              }
              resolve(text);
            });
          }
        );

        if (signal) {
          if (signal.aborted) {
            request.destroy(
              signal.reason instanceof Error ? signal.reason : new Error("Aborted")
            );
            reject(signal.reason instanceof Error ? signal.reason : new Error("Aborted"));
            return;
          }
          const onAbort = () => {
            request.destroy(
              signal.reason instanceof Error ? signal.reason : new Error("Aborted")
            );
          };
          signal.addEventListener("abort", onAbort, { once: true });
          request.on("close", () => signal.removeEventListener("abort", onAbort));
        }

        request.on("error", reject);
        request.write(payload);
        request.end();
      });

      try {
        return JSON.parse(rawBody) as UpstashRestResponse<TResult>;
      } catch (error) {
        throw new Error(
          `[mithron-cache] Upstash Redis returned non-JSON body: ${rawBody.slice(0, 200)}`,
          { cause: error }
        );
      }
    }
  };
}

export function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const credentials = getRedisRestCredentials();
  if (!credentials) {
    redisClient = null;
    logRedisEndpointRegionOnce();
    return redisClient;
  }

  const requester = createUpstashHttpsRequester(credentials.url, credentials.token);
  const client = new Redis(requester);

  // Requester ctor skips the nodejs wrapper's autoPipeline return; re-enable when available.
  redisClient =
    typeof (client as Redis & { autoPipeline?: () => Redis }).autoPipeline === "function"
      ? (client as Redis & { autoPipeline: () => Redis }).autoPipeline()
      : client;
  logRedisEndpointRegionOnce();
  return redisClient;
}

type RedisOp<T> = Promise<T> | (() => Promise<T>);

/**
 * Fail-fast wrapper for Upstash Redis REST calls. Prefer passing a factory
 * `() => redis.get(key)` so the request starts under the abort signal and is
 * cancelled on timeout instead of racing a hung fetch.
 */
export async function withRedisTimeout<T>(
  operation: string,
  promiseOrFactory: RedisOp<T>,
  timeoutMs: number = REDIS_OP_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => {
    controller.abort(
      new Error(`[mithron-cache] Redis ${operation} timed out after ${timeoutMs}ms`)
    );
  }, timeoutMs);

  try {
    const result = await redisAbortStore.run(controller, async () => {
      const promise =
        typeof promiseOrFactory === "function" ? promiseOrFactory() : promiseOrFactory;
      return await promise;
    });
    const elapsedMs = Date.now() - startedAt;
    recordRedisSample(elapsedMs, false, false);
    noteRedisSuccessForCircuit();
    // Warn below the fail-fast read budget so slow-but-successful GETs are visible.
    if (elapsedMs >= 150) {
      console.warn(`[mithron-cache] Redis ${operation} took ${elapsedMs}ms`);
    }
    return result;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    if (controller.signal.aborted) {
      recordRedisSample(elapsedMs, true, false);
      noteRedisTimeoutForCircuit();
      const reason = controller.signal.reason;
      if (reason instanceof Error) throw reason;
      throw new Error(
        `[mithron-cache] Redis ${operation} timed out after ${timeoutMs}ms`
      );
    }
    recordRedisSample(elapsedMs, false, true);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
