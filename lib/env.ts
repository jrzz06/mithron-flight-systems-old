// Inline payment gateway check to avoid importing server-only modules
// (prevents bundlers from pulling `node:crypto` into Edge runtime)
import { hasConfiguredSiteUrl } from "@/lib/site-url";

function isPaymentGatewayConfigured(env: Record<string, string | undefined> = process.env) {
  const hasRazorpay = Boolean(env.RAZORPAY_KEY_ID?.trim() && env.RAZORPAY_KEY_SECRET?.trim());
  const hasCashfree = Boolean(env.CASHFREE_APP_ID?.trim() && env.CASHFREE_SECRET_KEY?.trim());
  if (hasRazorpay || hasCashfree) return true;
  const provider = (env.PAYMENT_PROVIDER ?? "stub").toLowerCase();
  return provider === "stub" && env.NODE_ENV !== "production";
}

type EnvSource = Record<string, string | undefined>;

export type { EnvSource };

export type SupabasePublicConfig =
  | {
      configured: true;
      url: string;
      publishableKey: string;
    }
  | {
      configured: false;
      missing: string[];
      message: string;
    };

export type SupabaseAdminConfig =
  | {
      configured: true;
      url: string;
      publishableKey: string;
      serviceRoleKey: string;
    }
  | {
      configured: false;
      missing: string[];
      message: string;
    };

function getValue(env: EnvSource, key: string) {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

/** Next.js only inlines NEXT_PUBLIC_* when each variable is read statically. */
function readNextPublicSupabaseEnv(): EnvSource {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  };
}

export function getSupabasePublicConfig(env: EnvSource = readNextPublicSupabaseEnv()): SupabasePublicConfig {
  const url = getValue(env, "NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = getValue(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? getValue(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const missing = [
    !url ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !publishableKey ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : null
  ].filter((item): item is string => Boolean(item));

  if (missing.length || !url || !publishableKey) {
    return {
      configured: false,
      missing,
      message: `Missing Supabase public environment: ${missing.join(", ")}.`
    };
  }

  return { configured: true, url, publishableKey };
}

export function getSupabaseAdminConfig(env: EnvSource = process.env): SupabaseAdminConfig {
  const publicConfig = getSupabasePublicConfig(env);
  const serviceRoleKey = getValue(env, "SUPABASE_SERVICE_ROLE_KEY");
  const missing = [
    ...(!publicConfig.configured ? publicConfig.missing : []),
    !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null
  ].filter((item): item is string => Boolean(item));

  if (!publicConfig.configured || missing.length || !serviceRoleKey) {
    return {
      configured: false,
      missing,
      message: `Missing Supabase admin environment: ${missing.join(", ")}.`
    };
  }

  return {
    configured: true,
    url: publicConfig.url,
    publishableKey: publicConfig.publishableKey,
    serviceRoleKey
  };
}

export function assertSupabaseAdminConfig(env: EnvSource = process.env) {
  const config = getSupabaseAdminConfig(env);
  if (!config.configured) {
    throw new Error(config.message);
  }
  return config;
}

export function assertProductionRuntimeConfig(env: EnvSource = process.env) {
  if (env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  if (!env.RESEND_API_KEY?.trim()) missing.push("RESEND_API_KEY");
  if (!env.EMAIL_FROM?.trim()) missing.push("EMAIL_FROM");
  if (!env.NEXT_PUBLIC_SUPABASE_URL?.trim()) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!hasConfiguredSiteUrl(env)) missing.push("NEXT_PUBLIC_SITE_URL or Vercel deployment URL");
  if (!env.AUTH_AUDIT_CLIENT_SECRET?.trim()) missing.push("AUTH_AUDIT_CLIENT_SECRET");
  if (!env.PAYMENT_EXPIRE_SECRET?.trim()) missing.push("PAYMENT_EXPIRE_SECRET");

  const paymentProvider = env.PAYMENT_PROVIDER?.trim();
  if (!paymentProvider) {
    missing.push("PAYMENT_PROVIDER");
  } else if (!isPaymentGatewayConfigured(env)) {
    missing.push("PAYMENT_PROVIDER credentials");
  } else {
    const hasRazorpay = Boolean(env.RAZORPAY_KEY_ID?.trim() && env.RAZORPAY_KEY_SECRET?.trim());
    const hasCashfree = Boolean(env.CASHFREE_APP_ID?.trim() && env.CASHFREE_SECRET_KEY?.trim());
    if (hasRazorpay && !env.RAZORPAY_WEBHOOK_SECRET?.trim()) missing.push("RAZORPAY_WEBHOOK_SECRET");
    if (hasCashfree && !env.CASHFREE_WEBHOOK_SECRET?.trim()) missing.push("CASHFREE_WEBHOOK_SECRET");
  }

  // Prefer Upstash Redis, but Postgres auth_rate_limit_buckets is a production-safe fallback.
  const hasUpstash =
    Boolean(env.UPSTASH_REDIS_REST_URL?.trim() && env.UPSTASH_REDIS_REST_TOKEN?.trim())
    || Boolean(env.KV_REST_API_URL?.trim() && env.KV_REST_API_TOKEN?.trim());
  const hasPostgresFallback = Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
  if (!hasUpstash && !hasPostgresFallback) {
    missing.push("UPSTASH_REDIS_REST_URL");
    missing.push("UPSTASH_REDIS_REST_TOKEN");
  }

  if (env.ALLOW_DEMO_SEED === "true") {
    missing.push("ALLOW_DEMO_SEED must not be true in production");
  }

  if (!env.MAILERSEND_API_KEY?.trim()) {
    console.warn("[env] MAILERSEND_API_KEY is not set — email failover will stop at Resend.");
  }

  if (!env.AUTH_HOOK_SEND_EMAIL_SECRET?.trim()) {
    console.warn("[env] AUTH_HOOK_SEND_EMAIL_SECRET is not set — Supabase auth OTP hook delivery is disabled.");
  }

  if (missing.length) {
    throw new Error(`Missing required production environment: ${missing.join(", ")}.`);
  }
}

