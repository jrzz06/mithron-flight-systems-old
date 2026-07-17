import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { getActiveJobQueueProvider, isInngestEnabled } from "@/lib/jobs/queue-provider";

export async function GET(request: Request) {
  const limit = await checkDistributedRateLimit("inngest:status", 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  if (!isInngestEnabled()) {
    return NextResponse.json({
      ok: false,
      provider: getActiveJobQueueProvider(),
      message: "Inngest is not configured. Set MITHRON_JOB_QUEUE_PROVIDER=inngest with INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY."
    }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    provider: "inngest",
    message: "Inngest endpoint reserved. Install @inngest/next when background retries are required."
  });
}
