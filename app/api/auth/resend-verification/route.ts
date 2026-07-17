import { NextResponse } from "next/server";
import { isEmailBurstActive, isOtpCooldownActive, markEmailBurst, markOtpCooldown } from "@/lib/auth/delivery-cooldowns";
import { buildAuthConfirmUrl, resolveRequestOrigin } from "@/lib/auth/request-origin";
import { normalizeSignupEmail, rejectClientSuppliedRole } from "@/lib/auth/signup-validation";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createAuthRouteClient } from "@/lib/server";

type ResendBody = {
  email?: unknown;
};

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`auth-resend-verification:${ip}`, 3, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as ResendBody;
  const roleError = rejectClientSuppliedRole(body as Record<string, unknown>);
  if (roleError) {
    return NextResponse.json({ error: roleError }, { status: 400 });
  }

  const email = typeof body.email === "string" ? normalizeSignupEmail(body.email) : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  if (await isEmailBurstActive(ip)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  if (await isOtpCooldownActive(email)) {
    return NextResponse.json({ error: "Please wait before requesting another email." }, { status: 429 });
  }

  const origin = resolveRequestOrigin(request);
  const emailRedirectTo = buildAuthConfirmUrl(origin, "/account");
  const { supabase } = await createAuthRouteClient();

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo }
  });

  if (error) {
    return NextResponse.json(
      { error: "Unable to resend verification email. Please try again later." },
      { status: 400 }
    );
  }

  await markOtpCooldown(email, 60);
  await markEmailBurst(ip, 30);
  return NextResponse.json({ ok: true });
}
