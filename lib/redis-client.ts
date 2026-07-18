import { AsyncLocalStorage } from "node:async_hooks";
import https from "node:https";
import { Redis, type Requester } from "@upstash/redis";

let redisClient: Redis | null | undefined;

/**
 * Cap every Redis REST call so a degraded Upstash endpoint cannot stall
 * mutations. 4s leaves headroom for cold HTTPS handshakes (~0.5–1s observed)
 * while still failing fast vs unbounded hangs.
 */
export const REDIS_OP_TIMEOUT_MS = 4_000;

const redisAbortStore = new AsyncLocalStorage<AbortController>();

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
    return redisClient;
  }

  const requester = createUpstashHttpsRequester(credentials.url, credentials.token);
  const client = new Redis(requester);

  // Requester ctor skips the nodejs wrapper's autoPipeline return; re-enable when available.
  redisClient =
    typeof (client as Redis & { autoPipeline?: () => Redis }).autoPipeline === "function"
      ? (client as Redis & { autoPipeline: () => Redis }).autoPipeline()
      : client;
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
