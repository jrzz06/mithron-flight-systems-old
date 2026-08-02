import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron-lock";
import { authorizeBearerSecret } from "@/lib/api/bearer-auth";
import {
  resolveOrphanStorageApply,
  runOrphanStorageCleanup
} from "@/services/orphan-storage-cleanup";

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

async function runOrphanPrune(request: Request) {
  const auth = await authorizeBearerSecret(request, process.env.CRON_SECRET);
  const denied = bearerAuthResponse(auth);
  if (denied) return denied;

  const url = new URL(request.url);
  const applyQuery = url.searchParams.get("apply");
  // Query apply is honored only when env already enables apply — never force-delete from a dry-run deploy.
  const envApply = resolveOrphanStorageApply(process.env);
  const apply = envApply && (applyQuery == null || applyQuery === "1" || applyQuery === "true");

  try {
    const result = await runOrphanStorageCleanup(process.env, {
      dryRun: !apply,
      apply
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[admin/prune-orphan-storage] failed:", message);
    return NextResponse.json({ error: "Failed to prune orphan storage.", detail: message.slice(0, 300) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const locked = await withCronLock("lock:archive-job:prune-orphan-storage", 180, () => runOrphanPrune(request));
  return locked instanceof NextResponse ? locked : NextResponse.json(locked);
}

export async function POST(request: Request) {
  const locked = await withCronLock("lock:archive-job:prune-orphan-storage", 180, () => runOrphanPrune(request));
  return locked instanceof NextResponse ? locked : NextResponse.json(locked);
}
