import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron-lock";
import { authorizeBearerSecret } from "@/lib/api/bearer-auth";
import { assertSupabaseAdminConfig } from "@/lib/env";

const DEFAULT_RETENTION_DAYS = 60;
const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 365;
const DEFAULT_REVISION_KEEP_LAST = 15;
const MIN_REVISION_KEEP_LAST = 1;
const MAX_REVISION_KEEP_LAST = 100;
const DEFAULT_REVISION_RETENTION_DAYS = 120;

function parseBoundedInt(
  value: string | null | undefined,
  fallback: number,
  min: number,
  max: number
) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function resolveRetentionDays(request: Request) {
  const url = new URL(request.url);
  return parseBoundedInt(
    url.searchParams.get("retention_days") ?? process.env.OBSERVABILITY_LOG_RETENTION_DAYS,
    DEFAULT_RETENTION_DAYS,
    MIN_RETENTION_DAYS,
    MAX_RETENTION_DAYS
  );
}

function resolveRevisionKeepLast(request: Request) {
  const url = new URL(request.url);
  return parseBoundedInt(
    url.searchParams.get("revision_keep_last") ?? process.env.CONTENT_REVISION_KEEP_LAST,
    DEFAULT_REVISION_KEEP_LAST,
    MIN_REVISION_KEEP_LAST,
    MAX_REVISION_KEEP_LAST
  );
}

function resolveRevisionRetentionDays(request: Request) {
  const url = new URL(request.url);
  return parseBoundedInt(
    url.searchParams.get("revision_retention_days") ?? process.env.CONTENT_REVISION_RETENTION_DAYS,
    DEFAULT_REVISION_RETENTION_DAYS,
    MIN_RETENTION_DAYS,
    MAX_RETENTION_DAYS
  );
}

function bearerAuthResponse(auth: Awaited<ReturnType<typeof authorizeBearerSecret>>) {
  if (auth === "rate_limited") {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  if (auth === "misconfigured") {
    return NextResponse.json({ error: "Cron secret is not configured." }, { status: 503 });
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}

async function runPrune(request: Request) {
  const auth = await authorizeBearerSecret(request, process.env.CRON_SECRET);
  const denied = bearerAuthResponse(auth);
  if (denied) return denied;

  const retentionDays = resolveRetentionDays(request);
  const revisionKeepLast = resolveRevisionKeepLast(request);
  const revisionRetentionDays = resolveRevisionRetentionDays(request);
  const config = assertSupabaseAdminConfig(process.env);
  const response = await fetch(`${config.url}/rest/v1/rpc/prune_observability_logs`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      retention_days: retentionDays,
      revision_keep_last: revisionKeepLast,
      revision_retention_days: revisionRetentionDays
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("[admin/prune-logs] prune_observability_logs failed:", response.status, text);
    return NextResponse.json({ error: "Failed to prune observability logs." }, { status: 500 });
  }

  const result = await response.json().catch(() => null);
  return NextResponse.json({
    ok: true,
    retentionDays,
    revisionKeepLast,
    revisionRetentionDays,
    result
  });
}

export async function GET(request: Request) {
  const locked = await withCronLock("lock:archive-job:prune-logs", 60, () => runPrune(request));
  return locked instanceof NextResponse ? locked : NextResponse.json(locked);
}

export async function POST(request: Request) {
  const locked = await withCronLock("lock:archive-job:prune-logs", 60, () => runPrune(request));
  return locked instanceof NextResponse ? locked : NextResponse.json(locked);
}
