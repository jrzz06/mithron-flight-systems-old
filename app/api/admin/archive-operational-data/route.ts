import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron-lock";
import { authorizeBearerSecret } from "@/lib/api/bearer-auth";
import { createActivityLogRecord } from "@/services/admin-actions";
import {
  DEFAULT_ARCHIVE_RETENTION_DAYS,
  MAX_ARCHIVE_RETENTION_DAYS,
  MIN_ARCHIVE_RETENTION_DAYS,
  runOperationalDataArchive
} from "@/services/data-archive";

function parseRetentionDays(value: string | null) {
  if (!value?.trim()) return DEFAULT_ARCHIVE_RETENTION_DAYS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return DEFAULT_ARCHIVE_RETENTION_DAYS;
  return Math.min(MAX_ARCHIVE_RETENTION_DAYS, Math.max(MIN_ARCHIVE_RETENTION_DAYS, parsed));
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

  try {
    const { result, runs } = await runOperationalDataArchive(retentionDays);

    await createActivityLogRecord(
      {
        actor_id: null,
        action: "admin.archive_operational_data",
        entity_table: "data_archive_runs",
        entity_id: "monthly",
        severity: "info",
        metadata: {
          retention_days: retentionDays,
          ...result,
          runs_recorded: runs.length
        }
      },
      null
    );

    return NextResponse.json({ ok: true, retentionDays, result, runs });
  } catch (error) {
    console.error("[admin/archive-operational-data] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to archive operational data." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const locked = await withCronLock("lock:archive-job:archive-operational-data", 60, () => runArchive(request));
  return locked instanceof NextResponse ? locked : NextResponse.json(locked);
}

export async function POST(request: Request) {
  const locked = await withCronLock("lock:archive-job:archive-operational-data", 60, () => runArchive(request));
  return locked instanceof NextResponse ? locked : NextResponse.json(locked);
}
