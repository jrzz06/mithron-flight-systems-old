import { NextResponse } from "next/server";
import { authorizeBearerSecret } from "@/lib/api/bearer-auth";
import { withCronLock } from "@/lib/cron-lock";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout, mapWithConcurrency } from "@/lib/fetch-with-timeout";
import { dispatchEmailNotification } from "@/services/email/resend";

function bearerAuthResponse(auth: Awaited<ReturnType<typeof authorizeBearerSecret>>) {
  if (auth === "rate_limited") {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  if (auth === "misconfigured") {
    return NextResponse.json({ error: "Notification dispatch is not configured." }, { status: 503 });
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}

// Manual/programmatic trigger — authorized with the dedicated dispatch secret.
export async function POST(request: Request) {
  const auth = await authorizeBearerSecret(request, process.env.NOTIFICATION_DISPATCH_SECRET);
  const denied = bearerAuthResponse(auth);
  if (denied) return denied;
  return runDispatch();
}

// Vercel Cron trigger — Vercel invokes crons via GET with the platform
// CRON_SECRET bearer. Wrapped in a distributed lock so overlapping schedules
// cannot double-send.
export async function GET(request: Request) {
  const auth = await authorizeBearerSecret(request, process.env.CRON_SECRET);
  const denied = bearerAuthResponse(auth);
  if (denied) return denied;
  const locked = await withCronLock("lock:notifications:dispatch", 60, () => runDispatch());
  return locked;
}

async function markNotificationStatus(
  config: ReturnType<typeof assertSupabaseAdminConfig>,
  id: unknown,
  status: "sending" | "sent" | "unread",
  onlyIfStatus?: "unread" | "sending"
) {
  const filter = onlyIfStatus
    ? `id=eq.${id}&status=eq.${onlyIfStatus}`
    : `id=eq.${id}`;
  const patchResponse = await fetchWithTimeout(`${config.url}/rest/v1/notifications?${filter}`, {
    method: "PATCH",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify({ status, updated_at: new Date().toISOString() })
  });
  if (!patchResponse.ok) {
    throw new Error(`PATCH failed: ${patchResponse.status}`);
  }
  if (onlyIfStatus) {
    const rows = (await patchResponse.json().catch(() => [])) as unknown[];
    return Array.isArray(rows) && rows.length > 0;
  }
  return true;
}

async function runDispatch() {
  const config = assertSupabaseAdminConfig(process.env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/notifications?select=id,title,body,recipient_id,status,payload&status=eq.unread&order=created_at.asc&limit=50`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return NextResponse.json({ ok: false, dispatched: 0, failed: 0, total: 0 }, { status: 500 });
  }

  const rows = (await response.json()) as Array<Record<string, unknown>>;
  let dispatched = 0;
  let failed = 0;

  await mapWithConcurrency(rows, 5, async (row) => {
    const payload = row.payload as Record<string, unknown> | null;
    const email = typeof payload?.recipient_email === "string"
      ? payload.recipient_email
      : null;
    if (!email) {
      failed += 1;
      console.warn("[notifications/dispatch] skipped row without recipient email", { id: row.id });
      return;
    }
    try {
      // Claim the row before send so overlapping workers cannot double-deliver.
      const claimed = await markNotificationStatus(config, row.id, "sending", "unread");
      if (!claimed) return;

      await dispatchEmailNotification({
        recipientEmail: email,
        title: String(row.title ?? "Mithron notification"),
        body: String(row.body ?? "")
      });
      await markNotificationStatus(config, row.id, "sent");
      dispatched += 1;
    } catch (error) {
      failed += 1;
      try {
        // Restore unread so a later cron pass can retry.
        await markNotificationStatus(config, row.id, "unread", "sending");
      } catch {
        // Best-effort unlock.
      }
      console.error("[notifications/dispatch] row dispatch failed", {
        id: row.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  if (failed > 0) {
    console.error("[notifications/dispatch] completed with failures", {
      dispatched,
      failed,
      total: rows.length
    });
  }

  return NextResponse.json({
    ok: failed === 0 || dispatched > 0,
    dispatched,
    failed,
    total: rows.length
  });
}
