import { NextResponse } from "next/server";
import { authorizeBearerSecret } from "@/lib/api/bearer-auth";
import { getActiveJobQueueProvider, isQStashEnabled } from "@/lib/jobs/queue-provider";

export async function POST(request: Request) {
  if (!isQStashEnabled()) {
    return NextResponse.json({
      ok: false,
      provider: getActiveJobQueueProvider(),
      message: "QStash is not configured. Set MITHRON_JOB_QUEUE_PROVIDER=qstash with QSTASH_TOKEN."
    }, { status: 503 });
  }

  const auth = await authorizeBearerSecret(request, process.env.QSTASH_CURRENT_SIGNING_KEY);
  if (auth !== "ok") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  return NextResponse.json({
    ok: true,
    provider: "qstash",
    received: typeof body === "object" && body ? body : {}
  });
}
