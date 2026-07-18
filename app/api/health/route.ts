import { NextResponse } from "next/server";
import { authorizeBearerSecret } from "@/lib/api/bearer-auth";
import { getSupabasePublicConfig } from "@/lib/env";
import { getRedisClient, isRedisConfigured, withRedisTimeout } from "@/lib/redis-client";
import { getConfiguredEmailProviders } from "@/services/email/providers";

export const dynamic = "force-dynamic";

async function pingSupabase(timeoutMs = 1000) {
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
    return { ok: response.ok, detail: response.ok ? "reachable" : `${response.status}` };
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
    return { ok: false, detail: "not_configured" as const };
  }
  const redis = getRedisClient();
  if (!redis) {
    return { ok: false, detail: "client_unavailable" as const };
  }
  try {
    const pong = await withRedisTimeout("health.ping", () => redis.ping(), 1500);
    return { ok: pong === "PONG", detail: pong === "PONG" ? "reachable" : String(pong) };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "unreachable"
    };
  }
}

export async function GET(request: Request) {
  const [supabase, redis] = await Promise.all([pingSupabase(), pingRedis()]);
  // Redis required in production for rate limits + checkout idempotency.
  const redisRequired = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const healthy = supabase.ok && (!redisRequired || redis.ok);
  const status = healthy ? "ok" : "degraded";
  const auth = await authorizeBearerSecret(request, process.env.HEALTH_CHECK_SECRET);

  if (auth === "rate_limited") {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  if (auth !== "ok") {
    return NextResponse.json({ status }, { status: healthy ? 200 : 503 });
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
