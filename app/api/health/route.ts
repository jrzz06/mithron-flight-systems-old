import { NextResponse } from "next/server";
import { authorizeBearerSecret } from "@/lib/api/bearer-auth";
import { getSupabasePublicConfig } from "@/lib/env";
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

export async function GET(request: Request) {
  const supabase = await pingSupabase();
  const status = supabase.ok ? "ok" : "degraded";
  const auth = await authorizeBearerSecret(request, process.env.HEALTH_CHECK_SECRET);

  if (auth === "rate_limited") {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  if (auth !== "ok") {
    return NextResponse.json({ status }, { status: supabase.ok ? 200 : 503 });
  }

  const paymentsConfigured = Boolean(process.env.PAYMENT_PROVIDER?.trim());
  const emailProviders = getConfiguredEmailProviders();
  const emailConfigured = emailProviders.any && Boolean(process.env.EMAIL_FROM?.trim() || process.env.BREVO_FROM_EMAIL?.trim());

  return NextResponse.json({
    status,
    supabase,
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
  }, { status: supabase.ok ? 200 : 503 });
}
