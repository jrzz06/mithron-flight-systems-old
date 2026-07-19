import { NextResponse } from "next/server";
import { authorizeBearerSecret } from "@/lib/api/bearer-auth";

/** Operational cold-storage archive removed in the leads/fulfilment rebuild. */
async function disabledResponse(request: Request) {
  const auth = await authorizeBearerSecret(request, process.env.CRON_SECRET);
  if (auth === "rate_limited") {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  if (auth === "misconfigured") {
    return NextResponse.json({ error: "Cron secret is not configured." }, { status: 503 });
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    disabled: true,
    message: "Operational data archive has been removed. Orders use hard delete only."
  });
}

export async function GET(request: Request) {
  return disabledResponse(request);
}

export async function POST(request: Request) {
  return disabledResponse(request);
}
