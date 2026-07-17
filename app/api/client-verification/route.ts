import { NextResponse } from "next/server";
import { buildAuthAuditClientToken } from "@/lib/auth-audit-client";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";

export async function GET(request: Request) {
  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`client-verification:${rateKey}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const token = buildAuthAuditClientToken();
  if (!token) {
    return NextResponse.json(
      { error: "Guest verification is not configured on this environment." },
      { status: 503 }
    );
  }

  return NextResponse.json({ token });
}
