const LOCAL_DEV_SITE_URL = "http://127.0.0.1:3000";

/** Active Vercel production deployment (canonical app + auth hook target). */
export const CANONICAL_PRODUCTION_HOST = "final-mithron-deploy.vercel.app";
export const CANONICAL_PRODUCTION_ORIGIN = `https://${CANONICAL_PRODUCTION_HOST}`;

/** Brand domain — allowed for future cutover; not the live Vercel production URL. */
export const BRAND_PRODUCTION_HOST = "www.mithron.co";
export const BRAND_PRODUCTION_ORIGIN = `https://${BRAND_PRODUCTION_HOST}`;

/** @deprecated Use CANONICAL_PRODUCTION_HOST — kept for imports that referenced the Vercel alias name. */
export const VERCEL_PRODUCTION_HOST = CANONICAL_PRODUCTION_HOST;
export const VERCEL_PRODUCTION_ORIGIN = CANONICAL_PRODUCTION_ORIGIN;

const LOCAL_APP_HOSTS = ["localhost", "127.0.0.1"] as const;

const DEFAULT_ALLOWED_APP_HOSTS = [
  CANONICAL_PRODUCTION_HOST,
  BRAND_PRODUCTION_HOST,
  "mithron.co",
  ...LOCAL_APP_HOSTS
] as const;

export const DEFAULT_AUTH_REDIRECT_ORIGINS = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  CANONICAL_PRODUCTION_ORIGIN,
  BRAND_PRODUCTION_ORIGIN
] as const;

function normalizeSiteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return LOCAL_DEV_SITE_URL;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

function parseAllowedAppHosts(env: Record<string, string | undefined>) {
  const extra = (env.MITHRON_ALLOWED_APP_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_APP_HOSTS, ...extra]);
}

export function getAllowedAppHosts(env: Record<string, string | undefined> = process.env) {
  return [...parseAllowedAppHosts(env)];
}

export function isAllowedAppHost(hostname: string, env: Record<string, string | undefined> = process.env) {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  return parseAllowedAppHosts(env).has(host);
}

function resolveConfiguredProductionOrigin(env: Record<string, string | undefined>) {
  const explicitHost = env.MITHRON_PRODUCTION_HOST?.trim();
  if (explicitHost) {
    return normalizeSiteUrl(explicitHost);
  }

  const siteUrl = sanitizeAppOrigin(env.NEXT_PUBLIC_SITE_URL ? normalizeSiteUrl(env.NEXT_PUBLIC_SITE_URL) : null, env);
  if (siteUrl && env.VERCEL_ENV === "production") {
    return siteUrl;
  }

  return CANONICAL_PRODUCTION_ORIGIN;
}

export function getCanonicalProductionOrigin(env: Record<string, string | undefined> = process.env) {
  if (env.VERCEL_ENV === "production") {
    return resolveConfiguredProductionOrigin(env);
  }
  return CANONICAL_PRODUCTION_ORIGIN;
}

export function isCanonicalProductionHost(hostname: string, env: Record<string, string | undefined> = process.env) {
  const host = hostname.trim().toLowerCase();
  try {
    const canonicalHost = new URL(getCanonicalProductionOrigin(env)).hostname.toLowerCase();
    return host === canonicalHost;
  } catch {
    return host === CANONICAL_PRODUCTION_HOST;
  }
}

export function isObsoleteAppHost(hostname: string, env: Record<string, string | undefined> = process.env) {
  const host = hostname.trim().toLowerCase();
  if (!host || isAllowedAppHost(host, env)) return false;
  if (LOCAL_APP_HOSTS.some((localHost) => host === localHost || host.startsWith(`${localHost}:`))) {
    return false;
  }
  if (host.endsWith(".vercel.app")) return true;
  return false;
}

export function sanitizeAppOrigin(
  value: string | null | undefined,
  env: Record<string, string | undefined> = process.env
) {
  if (!value?.trim()) return null;

  try {
    const url = new URL(normalizeSiteUrl(value));
    if (isObsoleteAppHost(url.hostname, env)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function resolveSiteUrlString(env: Record<string, string | undefined> = process.env) {
  if (env.VERCEL_ENV === "production") {
    return getCanonicalProductionOrigin(env);
  }

  const candidates = [
    env.VERCEL_BRANCH_URL,
    env.VERCEL_URL,
    env.NEXT_PUBLIC_SITE_URL
  ];

  for (const candidate of candidates) {
    const sanitized = sanitizeAppOrigin(candidate ? normalizeSiteUrl(candidate) : null, env);
    if (sanitized) return sanitized;
  }

  return LOCAL_DEV_SITE_URL;
}

export function getSiteUrl(env: Record<string, string | undefined> = process.env) {
  try {
    return new URL(resolveSiteUrlString(env));
  } catch {
    return new URL(LOCAL_DEV_SITE_URL);
  }
}

export function getSiteOrigin(env: Record<string, string | undefined> = process.env) {
  return getSiteUrl(env).origin;
}

export function toAbsoluteUrl(path: string, env: Record<string, string | undefined> = process.env) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, getSiteUrl(env)).toString();
}

export function hasConfiguredSiteUrl(env: Record<string, string | undefined> = process.env) {
  if (env.VERCEL_ENV === "production") return true;
  if (env.MITHRON_PRODUCTION_HOST?.trim()) return true;
  if (isAllowedAppHost(VERCEL_PRODUCTION_HOST, env)) return true;
  if (sanitizeAppOrigin(env.VERCEL_BRANCH_URL, env)) return true;
  if (sanitizeAppOrigin(env.VERCEL_URL, env)) return true;
  return Boolean(sanitizeAppOrigin(env.NEXT_PUBLIC_SITE_URL, env));
}

/** Client-side auth redirects: prefer canonical URL; reject obsolete deployment hosts. */
export function resolveClientAuthOrigin(env: Record<string, string | undefined> = process.env) {
  const configured = sanitizeAppOrigin(env.NEXT_PUBLIC_SITE_URL, env);
  if (configured) return configured;

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (isObsoleteAppHost(host, env)) return getCanonicalProductionOrigin(env);
    const browserOrigin = sanitizeAppOrigin(window.location.origin, env);
    if (browserOrigin) return browserOrigin;
  }

  if (env.VERCEL_ENV === "production") return getCanonicalProductionOrigin(env);

  return getSiteOrigin(env);
}

/** Supabase Auth redirect allow-list entries (wildcard suffix). */
export function buildAuthRedirectAllowList(env: Record<string, string | undefined> = process.env) {
  const origins = new Set<string>(DEFAULT_AUTH_REDIRECT_ORIGINS);

  const configuredProduction = env.MITHRON_PRODUCTION_HOST?.trim();
  if (configuredProduction) {
    origins.add(normalizeSiteUrl(configuredProduction).replace(/\/$/, ""));
  }

  const siteUrl = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    origins.add(normalizeSiteUrl(siteUrl).replace(/\/$/, ""));
  }

  return [...origins].flatMap((origin) => [
    `${origin}/**`,
    `${origin}/auth/callback`,
    `${origin}/auth/confirm`
  ]);
}
