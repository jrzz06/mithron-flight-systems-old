import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { listPublicPaymentProviders } from "@/services/payments/gateway";

export async function GET(request: Request) {
  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`payments-providers:${rateKey}`, 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const providers = listPublicPaymentProviders();
  return NextResponse.json({ providers });
}
