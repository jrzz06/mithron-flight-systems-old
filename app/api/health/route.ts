import { NextResponse } from "next/server";
import { authorizeBearerSecret } from "@/lib/api/bearer-auth";
import { getSupabasePublicConfig } from "@/lib/env";
import {
  getRedisClient,
  isRedisConfigured,
  withRedisTimeout,
  REDIS_HEALTH_PING_TIMEOUT_MS
} from "@/lib/redis-client";
import { getConfiguredEmailProviders } from "@/services/email/providers";

export const dynamic = "force-dynamic";

/** Short in-process probe cache — cuts concurrent health stampede without weakening auth. */
const HEALTH_PROBE_CACHE_TTL_MS = 2_500;

type HealthProbeSnapshot = {
  supabase: Awaited<ReturnType<typeof pingSupabase>>;
  redis: Awaited<ReturnType<typeof pingRedis>>;
  cachedAt: number;
};

let healthProbeCache: HealthProbeSnapshot | null = null;
let healthProbeInflight: Promise<Omit<HealthProbeSnapshot, "cachedAt">> | null = null;

async function getHealthProbes() {
  const now = Date.now();
  if (healthProbeCache && now - healthProbeCache.cachedAt < HEALTH_PROBE_CACHE_TTL_MS) {
    return healthProbeCache;
  }
  if (!healthProbeInflight) {
    healthProbeInflight = Promise.all([pingSupabase(), pingRedis()])
      .then(([supabase, redis]) => ({ supabase, redis }))
      .finally(() => {
        healthProbeInflight = null;
      });
  }
  const probes = await healthProbeInflight;
  healthProbeCache = { ...probes, cachedAt: Date.now() };
  return healthProbeCache;
}

async function pingSupabase(timeoutMs = 3_000) {
  const config = getSupabasePublicConfig();
  if (!config.configured) return { ok: false, detail: config.message };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.url}/rest/v1/`, {
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${config.publishableKey}`
      },
      cache: "no-store",
      signal: controller.signal
    });
    // Any HTTP response (incl. 401 without a valid key) means PostgREST is reachable.
    // Only transport failures / timeouts should mark Supabase unhealthy.
    const reachable = response.status > 0 && response.status < 500;
    return { ok: reachable, detail: reachable ? "reachable" : `${response.status}` };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "unreachable"
    };
  } finally {
    clearTimeout(timer);
  }
}

async function pingRedis() {
  if (!isRedisConfigured()) {
    return { ok: false, detail: "not_configured" as const, latencyMs: null as number | null };
  }
  const redis = getRedisClient();
  if (!redis) {
    return { ok: false, detail: "client_unavailable" as const, latencyMs: null as number | null };
  }
  const startedAt = Date.now();
  try {
    const pong = await withRedisTimeout(
      "health.ping",
      () => redis.ping(),
      REDIS_HEALTH_PING_TIMEOUT_MS
    );
    const latencyMs = Date.now() - startedAt;
    return {
      ok: pong === "PONG",
      detail: pong === "PONG" ? "reachable" : String(pong),
      latencyMs
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "unreachable",
      latencyMs: Date.now() - startedAt
    };
  }
}

export async function GET(request: Request) {
  const { supabase, redis } = await getHealthProbes();
  // Redis required in production for rate limits + checkout idempotency.
  const redisRequired = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const healthy = supabase.ok && (!redisRequired || redis.ok);
  const status = healthy ? "ok" : "degraded";

  // Only spend the bearer rate-limit budget when a secret is presented.
  // Anonymous shallow probes (uptime monitors) must not burn auth attempt
  // quotas — that previously returned 429 under concurrent /api/health load
  // even though no secret was being guessed. Wrong/missing secrets still
  // get the shallow body; wrong secrets WITH Authorization stay rate-limited.
  const hasAuthorization = Boolean(request.headers.get("authorization")?.trim());
  const auth = hasAuthorization
    ? await authorizeBearerSecret(request, process.env.HEALTH_CHECK_SECRET)
    : "unauthorized";

  if (auth === "rate_limited") {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  if (auth !== "ok") {
    // Shallow public body: enough for uptime monitors without leaking internals.
    return NextResponse.json(
      {
        status,
        supabase: { ok: supabase.ok },
        redis: { ok: redis.ok, configured: isRedisConfigured() }
      },
      { status: healthy ? 200 : 503 }
    );
  }

  const paymentsConfigured = Boolean(process.env.PAYMENT_PROVIDER?.trim());
  const emailProviders = getConfiguredEmailProviders();
  const emailConfigured = emailProviders.any && Boolean(process.env.EMAIL_FROM?.trim() || process.env.BREVO_FROM_EMAIL?.trim());

  return NextResponse.json({
    status,
    supabase,
    redis,
    payments: { configured: paymentsConfigured, provider: process.env.PAYMENT_PROVIDER ?? null },
    email: {
      configured: emailConfigured,
      providers: {
        brevo: emailProviders.brevo,
        resend: emailProviders.resend,
        mailersend: emailProviders.mailersend
      },
      hook: emailProviders.hook
    },
    build_id: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.BUILD_ID ?? "local"
  }, { status: healthy ? 200 : 503 });
}
