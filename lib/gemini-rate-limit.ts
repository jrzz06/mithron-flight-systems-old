import { checkRateLimit } from "./rate-limit.ts";
import { checkDistributedRateLimit } from "./rate-limit-redis.ts";
import { getRedisClient, withRedisTimeout } from "./redis-client.ts";
import {
  estimateGeminiTokens,
  resolveGeminiConservativeLimits,
  resolveGeminiModelProfile
} from "./gemini-model-policy.ts";

type TpmBucket = { tokens: number; resetAt: number };

const tpmBuckets = new Map<string, TpmBucket>();
const lastRequestAt = new Map<string, number>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function reserveCounter(key: string, maxRequests: number, windowMs: number) {
  try {
    return await checkDistributedRateLimit(key, maxRequests, windowMs);
  } catch (error) {
    // checkDistributedRateLimit already fail-closes in production; only use
    // in-memory as a last resort outside production so local Gemini still works.
    if (process.env["NODE_ENV"] === "production") {
      console.error("[mithron] Gemini request rate limit backend threw; denying (fail-closed).", error);
      return { allowed: false, remaining: 0, retryAfterMs: windowMs, degraded: true };
    }
    return checkRateLimit(key, maxRequests, windowMs);
  }
}

function reserveTokenBudgetMemory(key: string, needed: number, maxTpm: number) {
  const now = Date.now();
  let entry = tpmBuckets.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { tokens: 0, resetAt: now + 60_000 };
    tpmBuckets.set(key, entry);
  }

  if (entry.tokens + needed > maxTpm) {
    return { allowed: false, retryAfterMs: Math.max(250, entry.resetAt - now) };
  }

  entry.tokens += needed;
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Atomic TPM reserve: refuse without INCR when already over ceiling; otherwise
 * INCRBY then EXPIRE if key has no TTL. Soft-denies on post-incr overshoot.
 * Returns { nextTokens, ttlSeconds, allowedFlag } where allowedFlag is 1/0.
 */
const GEMINI_TPM_RESERVE_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local needed = tonumber(ARGV[1])
local windowSec = tonumber(ARGV[2])
local maxTpm = tonumber(ARGV[3])
local ttl = redis.call('TTL', KEYS[1])
if current + needed > maxTpm then
  if ttl < 0 then ttl = windowSec end
  return { current, ttl, 0 }
end
local next = redis.call('INCRBY', KEYS[1], needed)
ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], windowSec)
  ttl = windowSec
end
if next > maxTpm then
  return { next, ttl, 0 }
end
return { next, ttl, 1 }
`;

async function reserveTokenBudget(key: string, needed: number, maxTpm: number) {
  const redis = getRedisClient();
  if (redis) {
    try {
      const result = await withRedisTimeout(
        `GEMINI_TPM_EVAL ${key}`,
        () => redis.eval<[number, number, number], [number, number, number]>(
          GEMINI_TPM_RESERVE_LUA,
          [key],
          [needed, 60, maxTpm]
        )
      );
      const ttl = Number(Array.isArray(result) ? result[1] : 60);
      const allowed = Number(Array.isArray(result) ? result[2] : 0) === 1;
      if (!allowed) {
        const retryAfterMs = ttl > 0 ? ttl * 1000 : 60_000;
        return { allowed: false, retryAfterMs: Math.max(250, retryAfterMs) };
      }
      return { allowed: true, retryAfterMs: 0 };
    } catch (error) {
      console.warn("[mithron] Gemini TPM Redis path failed; falling back to in-memory.", error);
    }
  }

  return reserveTokenBudgetMemory(key, needed, maxTpm);
}

async function readLastRequestAt(spacingKey: string): Promise<number> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const value = await withRedisTimeout(
        `GEMINI_SPACING_GET ${spacingKey}`,
        () => redis.get<number | string>(spacingKey)
      );
      const parsed = Number(value ?? 0);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    } catch (error) {
      console.warn("[mithron] Gemini spacing Redis GET failed; falling back to in-memory.", error);
    }
  }
  return lastRequestAt.get(spacingKey) ?? 0;
}

async function writeLastRequestAt(spacingKey: string, at: number): Promise<void> {
  lastRequestAt.set(spacingKey, at);
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await withRedisTimeout(
      `GEMINI_SPACING_SET ${spacingKey}`,
      () => redis.set(spacingKey, at, { ex: 120 })
    );
  } catch (error) {
    console.warn("[mithron] Gemini spacing Redis SET failed; in-memory spacing still applied.", error);
  }
}

export class GeminiRateLimitError extends Error {
  retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = "GeminiRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export async function acquireGeminiTextSlot(input: {
  model: string;
  system?: string;
  prompt?: string;
  estimatedTokens?: number;
  maxWaitMs?: number;
  env?: Record<string, string | undefined>;
}) {
  const env = input.env ?? process.env;
  const model = resolveGeminiModelProfile(input.model).id;
  const limits = resolveGeminiConservativeLimits(model, env);
  const estimatedTokens = input.estimatedTokens
    ?? estimateGeminiTokens(input.system, input.prompt);
  const maxWaitMs = input.maxWaitMs ?? Number(env.GEMINI_RATE_LIMIT_MAX_WAIT_MS ?? "120000");
  const startedAt = Date.now();
  const waitBudget = () => Math.max(0, maxWaitMs - (Date.now() - startedAt));

  while (waitBudget() > 0) {
    const spacingKey = `gemini:spacing:${model}`;
    const previous = await readLastRequestAt(spacingKey);
    const sinceLast = Date.now() - previous;
    if (sinceLast < limits.minIntervalMs) {
      await sleep(Math.min(limits.minIntervalMs - sinceLast, waitBudget()));
    }

    const rpm = await reserveCounter(`gemini:rpm:${model}`, limits.rpm, 60_000);
    if (!rpm.allowed) {
      await sleep(Math.min(rpm.retryAfterMs ?? 5_000, waitBudget()));
      continue;
    }

    const rpd = await reserveCounter(`gemini:rpd:${model}:${utcDayKey()}`, limits.rpd, 86_400_000);
    if (!rpd.allowed) {
      throw new GeminiRateLimitError(
        `Gemini daily request cap reached for ${model} (${limits.rpd}/day internal limit).`,
        rpd.retryAfterMs
      );
    }

    if (limits.tpm) {
      const tpm = await reserveTokenBudget(`gemini:tpm:${model}`, estimatedTokens, limits.tpm);
      if (!tpm.allowed) {
        await sleep(Math.min(tpm.retryAfterMs ?? 5_000, waitBudget()));
        continue;
      }
    }

    await writeLastRequestAt(spacingKey, Date.now());
    return { model, estimatedTokens, limits };
  }

  throw new GeminiRateLimitError(
    `Timed out waiting for Gemini rate limit slot (${model}).`,
    waitBudget()
  );
}

export function resetGeminiRateLimitStateForTests() {
  tpmBuckets.clear();
  lastRequestAt.clear();
}
