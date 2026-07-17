import { NextResponse } from "next/server";
import { isEmailBurstActive, markEmailBurst } from "@/lib/auth/delivery-cooldowns";
import {
  mapSendEmailHookToOutbound,
  verifySupabaseSendEmailHook
} from "@/lib/auth/send-email-hook";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { sendEmailWithFallback } from "@/services/email/providers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`auth-send-email-hook:${rateKey}`, 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  if (await isEmailBurstActive(rateKey)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const secret = process.env.AUTH_HOOK_SEND_EMAIL_SECRET?.trim();
  if (!secret) {
    console.error("[mithron-auth] Send-email hook invoked but AUTH_HOOK_SEND_EMAIL_SECRET is missing.");
    return NextResponse.json({ error: "Hook not configured." }, { status: 503 });
  }

  const body = await request.text();
  const headers = {
    "webhook-id": request.headers.get("webhook-id") ?? undefined,
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? undefined,
    "webhook-signature": request.headers.get("webhook-signature") ?? undefined
  };

  let payload;
  try {
    payload = verifySupabaseSendEmailHook(body, headers, secret);
  } catch (error) {
    console.warn("[mithron-auth] Send-email hook signature verification failed.", error);
    return NextResponse.json({ error: "Invalid hook signature." }, { status: 401 });
  }

  let outbound;
  try {
    outbound = mapSendEmailHookToOutbound(payload);
  } catch (error) {
    console.warn("[mithron-auth] Send-email hook payload rejected.", error);
    return NextResponse.json({ error: "Invalid hook payload." }, { status: 400 });
  }

  try {
    const result = await sendEmailWithFallback(outbound);
    if (!result.ok) {
      return NextResponse.json({ error: "No email provider configured." }, { status: 503 });
    }
    await markEmailBurst(rateKey, 30);
    return NextResponse.json({ ok: true, provider: result.provider ?? null });
  } catch (error) {
    console.error("[mithron-auth] Send-email hook delivery failed across all providers.", error);
    return NextResponse.json({ error: "Email delivery failed." }, { status: 500 });
  }
}
