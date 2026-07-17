import { NextResponse } from "next/server";
import { isEmailBurstActive, isOtpCooldownActive, markEmailBurst, markOtpCooldown } from "@/lib/auth/delivery-cooldowns";
import { resolveAuthRedirectUrlFromRequest } from "@/lib/auth/request-origin";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createAuthRouteClient } from "@/lib/server";

type ForgotPasswordBody = {
  email?: unknown;
  redirectTo?: unknown;
};

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`auth-forgot-password:${ip}`, 5, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as ForgotPasswordBody;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const redirectTo = resolveAuthRedirectUrlFromRequest(request, {
    clientRedirectTo: typeof body.redirectTo === "string" ? body.redirectTo : "",
    defaultPath: "/reset-password"
  });

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  if (await isEmailBurstActive(ip)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  if (await isOtpCooldownActive(email)) {
    return NextResponse.json({ ok: true });
  }

  const { supabase } = await createAuthRouteClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo
  });

  if (error) {
    // Return a generic message to prevent email enumeration
    console.warn("[mithron-auth] Password reset request failed.", { email, error: error.message });
  }

  // Always return success to prevent email enumeration
  await markOtpCooldown(email, 60);
  await markEmailBurst(ip, 30);
  return NextResponse.json({ ok: true });
}
