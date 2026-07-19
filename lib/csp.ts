import { randomBytes } from "node:crypto";

type EnvSource = Record<string, string | undefined>;

export function generateCspNonce() {
  // base64url avoids `/` and `+`, which can break CSP nonce parsing / HTML attributes.
  return randomBytes(16).toString("base64url");
}

export function isPaymentSurfacePath(pathname: string) {
  return pathname === "/checkout" || pathname.startsWith("/checkout/");
}

function resolveSupabaseOrigin(env: EnvSource) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function cashfreeDirectiveOrigins() {
  return [
    "https://sdk.cashfree.com",
    "https://payments.cashfree.com",
    "https://api.cashfree.com",
    "https://sandbox.cashfree.com",
    "https://*.cashfree.com"
  ];
}

function razorpayDirectiveOrigins() {
  return [
    "https://checkout.razorpay.com",
    "https://api.razorpay.com",
    "https://cdn.razorpay.com",
    "https://lumberjack.razorpay.com",
    "https://*.razorpay.com"
  ];
}

function buildImageSrcDirective(env: EnvSource) {
  const supabaseOrigin = resolveSupabaseOrigin(env);
  if (env.NODE_ENV !== "production") {
    return ["'self'", "data:", "blob:", "https:", ...(supabaseOrigin ? [supabaseOrigin] : [])].join(" ");
  }

  return [
    "'self'",
    "data:",
    "blob:",
    ...razorpayDirectiveOrigins(),
    ...cashfreeDirectiveOrigins(),
    ...(supabaseOrigin ? [supabaseOrigin] : [])
  ].join(" ");
}

/**
 * Checkout needs a looser CSP than the rest of the storefront.
 * Razorpay/Cashfree inject inline scripts and load QR assets from many subdomains;
 * a nonce-only script policy leaves UPI QR stuck on "Loading".
 */
export function buildPaymentContentSecurityPolicy(_nonce: string, env: EnvSource = process.env) {
  const devEval = env.NODE_ENV !== "production" ? ["'unsafe-eval'"] : [];
  const devConnect = env.NODE_ENV !== "production" ? ["ws:", "wss:"] : [];
  const razorpayOrigins = razorpayDirectiveOrigins();
  const cashfreeOrigins = cashfreeDirectiveOrigins();
  const supabaseOrigin = resolveSupabaseOrigin(env);

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...devEval,
    ...razorpayOrigins,
    ...cashfreeOrigins,
    "https://www.gstatic.com",
    "https://www.google.com",
    "https://apis.google.com"
  ].join(" ");

  const styleSrc = [
    "'self'",
    "'unsafe-inline'",
    "https://fonts.googleapis.com",
    ...razorpayOrigins,
    ...cashfreeOrigins
  ].join(" ");

  const fontSrc = [
    "'self'",
    "data:",
    "https://fonts.gstatic.com",
    ...razorpayOrigins,
    ...cashfreeOrigins
  ].join(" ");

  const connectSrc = [
    "'self'",
    "https:",
    ...devConnect,
    ...(supabaseOrigin ? [supabaseOrigin] : [])
  ].join(" ");

  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    "https:",
    ...(supabaseOrigin ? [supabaseOrigin] : [])
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `font-src ${fontSrc}`,
    `frame-src ${["'self'", ...razorpayOrigins, ...cashfreeOrigins, "https://www.google.com", "https://accounts.google.com"].join(" ")}`,
    `connect-src ${connectSrc}`,
    `img-src ${imgSrc}`,
    "worker-src 'self' blob:",
    `media-src 'self' blob: data: ${razorpayOrigins.join(" ")}`,
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self' https://api.razorpay.com https://checkout.razorpay.com https://payments.cashfree.com https://api.cashfree.com https://sandbox.cashfree.com",
    "report-uri /api/csp-report"
  ].join("; ");
}

/**
 * Storefront CSP.
 *
 * Important: do **not** require a per-request script nonce here.
 * Home/catalog pages are ISR/prerendered (`revalidate`), so the HTML (and React
 * flight/bootstrap inline scripts) is cached without matching nonces. A fresh
 * `nonce-…` in the CSP header on each request blocks those scripts → Suspense
 * skeletons never resolve (gray nav + black hero). Checkout already uses
 * `'unsafe-inline'` for the same class of reason.
 */
export function buildContentSecurityPolicy(_nonce: string, env: EnvSource = process.env) {
  const devScriptDirectives = env.NODE_ENV !== "production" ? ["'unsafe-eval'"] : [];
  const devConnectDirectives = env.NODE_ENV !== "production" ? ["ws:", "wss:"] : [];
  const razorpayOrigins = razorpayDirectiveOrigins();
  const cashfreeOrigins = cashfreeDirectiveOrigins();
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...devScriptDirectives,
    ...razorpayOrigins,
    ...cashfreeOrigins,
    "https://www.gstatic.com",
    "https://www.google.com",
    "https://apis.google.com"
  ].join(" ");
  const connectSrc = [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://accounts.google.com",
    "https://www.googleapis.com",
    "https://www.google.com",
    "https://*.googleapis.com",
    ...razorpayOrigins,
    ...cashfreeOrigins,
    ...devConnectDirectives
  ].join(" ");
  const frameSrc = [
    "'self'",
    ...razorpayOrigins,
    ...cashfreeOrigins,
    "https://www.google.com",
    "https://accounts.google.com"
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ${razorpayOrigins.join(" ")} ${cashfreeOrigins.join(" ")}`,
    `font-src 'self' data: https://fonts.gstatic.com ${razorpayOrigins.join(" ")} ${cashfreeOrigins.join(" ")}`,
    `frame-src ${frameSrc}`,
    `connect-src ${connectSrc}`,
    `img-src ${buildImageSrcDirective(env)}`,
    "worker-src 'self' blob:",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self' https://api.razorpay.com https://checkout.razorpay.com https://payments.cashfree.com https://api.cashfree.com https://sandbox.cashfree.com",
    "report-uri /api/csp-report"
  ].join("; ");
}

export function buildContentSecurityPolicyForPath(pathname: string, nonce: string, env: EnvSource = process.env) {
  return isPaymentSurfacePath(pathname)
    ? buildPaymentContentSecurityPolicy(nonce, env)
    : buildContentSecurityPolicy(nonce, env);
}
