import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron-lock";
import { authorizeBearerSecret } from "@/lib/api/bearer-auth";
import { assertSupabaseAdminConfig } from "@/lib/env";

const DEFAULT_RETENTION_DAYS = 395;
const MIN_RETENTION_DAYS = 90;
const MAX_RETENTION_DAYS = 1825;

function parseRetentionDays(value: string | null) {
  if (!value?.trim()) return DEFAULT_RETENTION_DAYS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return DEFAULT_RETENTION_DAYS;
  return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, parsed));
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

async function runArchive(request: Request) {
  const auth = await authorizeBearerSecret(request, process.env.CRON_SECRET);
  const denied = bearerAuthResponse(auth);
  if (denied) return denied;

  const url = new URL(request.url);
  const retentionDays = parseRetentionDays(url.searchParams.get("retention_days"));
  const config = assertSupabaseAdminConfig(process.env);
  const response = await fetch(`${config.url}/rest/v1/rpc/archive_inventory_movements`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ retention_days: retentionDays }),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("[admin/archive-movements] archive_inventory_movements failed:", response.status, text);
    return NextResponse.json({ error: "Failed to archive inventory movements." }, { status: 500 });
  }

  const result = await response.json().catch(() => null);
  return NextResponse.json({ ok: true, retentionDays, result });
}

export async function GET(request: Request) {
  const locked = await withCronLock("lock:archive-job:archive-movements", 60, () => runArchive(request));
  return locked instanceof NextResponse ? locked : NextResponse.json(locked);
}

export async function POST(request: Request) {
  const locked = await withCronLock("lock:archive-job:archive-movements", 60, () => runArchive(request));
  return locked instanceof NextResponse ? locked : NextResponse.json(locked);
}
