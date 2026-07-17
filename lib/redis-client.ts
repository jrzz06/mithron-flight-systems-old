import { AsyncLocalStorage } from "node:async_hooks";
import https from "node:https";
import { Redis } from "@upstash/redis";

let redisClient: Redis | null | undefined;

/**
 * Cap every Redis REST call so a degraded Upstash endpoint cannot stall
 * mutations. 4s leaves headroom for cold HTTPS handshakes (~0.5–1s observed)
 * while still failing fast vs unbounded hangs.
 */
export const REDIS_OP_TIMEOUT_MS = 4_000;

const redisAbortStore = new AsyncLocalStorage<AbortController>();
const neverAbortSignal = new AbortController().signal;

const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  maxFreeSockets: 16,
  scheduling: "lifo"
});

export function getRedisRestCredentials() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim()
    || process.env.KV_REST_API_URL?.trim()
    || "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
    || process.env.KV_REST_API_TOKEN?.trim()
    || "";
  if (!url || !token) return null;
  if (/deploy-placeholder\.upstash\.io/i.test(url)) return null;
  return { url, token };
}

export function isRedisConfigured() {
  return getRedisRestCredentials() !== null;
}

export function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const credentials = getRedisRestCredentials();
  if (!credentials) {
    redisClient = null;
    return redisClient;
  }
  redisClient = new Redis({
    url: credentials.url,
    token: credentials.token,
    keepAlive: true,
    agent: keepAliveAgent,
    enableAutoPipelining: true,
    retry: {
      retries: 2,
      backoff: (retryCount) => Math.min(75 * 2 ** retryCount, 400)
    },
    // Per-operation abort from withRedisTimeout (never-abort fallback when unset).
    signal: () => redisAbortStore.getStore()?.signal ?? neverAbortSignal
  });
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
  let timer: ReturnType<typeof setTimeout> | undefined;

  timer = setTimeout(() => {
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
    if (elapsedMs >= 500) {
      console.warn(`[mithron-cache] Redis ${operation} took ${elapsedMs}ms`);
    }
    return result;
  } catch (error) {
    if (controller.signal.aborted) {
      const reason = controller.signal.reason;
      if (reason instanceof Error) throw reason;
      throw new Error(
        `[mithron-cache] Redis ${operation} timed out after ${timeoutMs}ms`
      );
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
