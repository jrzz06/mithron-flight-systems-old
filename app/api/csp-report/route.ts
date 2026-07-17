import { NextResponse, type NextRequest } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";

const MAX_CSP_REPORT_BYTES = 4096;

export async function POST(request: NextRequest) {
  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  try {
    const limit = await checkDistributedRateLimit(`csp-report:${rateKey}`, 20, 60_000);
    if (!limit.allowed) {
      return new NextResponse(null, { status: 429 });
    }
  } catch {
    return new NextResponse(null, { status: 503 });
  }

  const body = await request.text().catch(() => "");
  if (body && body.length <= MAX_CSP_REPORT_BYTES) {
    console.warn("[csp-report]", body.slice(0, 2000));
  }
  return NextResponse.json({ ok: true });
}
