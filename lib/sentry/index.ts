import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || process.env.SENTRY_DSN?.trim();

export function isSentryEnabled() {
  return Boolean(dsn);
}

export function initSentry() {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    enabled: process.env.NODE_ENV === "production" || process.env.SENTRY_ENABLE_DEV === "true"
  });
}

export function captureServerException(error: unknown, context?: Record<string, unknown>) {
  if (!isSentryEnabled()) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
