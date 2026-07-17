import { NextResponse } from "next/server";
import { isEmailBurstActive, isOtpCooldownActive, markEmailBurst, markOtpCooldown } from "@/lib/auth/delivery-cooldowns";
import { authEmailDeliveryUnavailableResponse, isAuthEmailDeliveryConfigured } from "@/lib/auth/email-delivery-ready";
import { mapOtpSendErrorForClient, shouldExposeSignInOtpSendError } from "@/lib/auth/otp-send-errors";
import { buildAuthConfirmUrl, resolveRequestOrigin } from "@/lib/auth/request-origin";
import { normalizeSignupEmail, rejectClientSuppliedRole, validateSignupEmail } from "@/lib/auth/signup-validation";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createAuthRouteClient } from "@/lib/server";

type SendOtpBody = {
  email?: unknown;
  purpose?: unknown;
};

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`auth-send-otp:${ip}`, 3, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  if (await isEmailBurstActive(ip)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  if (!isAuthEmailDeliveryConfigured()) {
    return NextResponse.json(authEmailDeliveryUnavailableResponse(), { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as SendOtpBody;
  const roleError = rejectClientSuppliedRole(body as Record<string, unknown>);
  if (roleError) {
    return NextResponse.json({ error: roleError }, { status: 400 });
  }

  const emailRaw = typeof body.email === "string" ? body.email : "";
  const emailResult = validateSignupEmail(emailRaw);
  if (!emailResult.ok) {
    return NextResponse.json({ error: emailResult.error }, { status: 400 });
  }
  const email = normalizeSignupEmail(emailResult.value);
  const purpose = body.purpose === "signin" || body.purpose === "signup" ? body.purpose : null;

  if (!purpose) {
    return NextResponse.json({ error: "Email and purpose are required." }, { status: 400 });
  }

  if (await isOtpCooldownActive(email)) {
    return NextResponse.json({ error: "Please wait before requesting another code." }, { status: 429 });
  }

  const { supabase } = await createAuthRouteClient();

  if (purpose === "signin") {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }
    });

    if (error) {
      console.warn("[mithron-auth] Sign-in OTP send failed.", error.message);
      if (shouldExposeSignInOtpSendError(error)) {
        return NextResponse.json(
          { error: mapOtpSendErrorForClient(error) },
          { status: 400 }
        );
      }
    }

    await markOtpCooldown(email, 60);
    await markEmailBurst(ip, 30);
    return NextResponse.json({ ok: true });
  }

  const origin = resolveRequestOrigin(request);
  const emailRedirectTo = buildAuthConfirmUrl(origin, "/account");

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo }
  });

  if (error) {
    console.warn("[mithron-auth] Signup OTP resend failed.", error.message);
    return NextResponse.json(
      { error: mapOtpSendErrorForClient(error) },
      { status: 400 }
    );
  }

  await markOtpCooldown(email, 60);
  await markEmailBurst(ip, 30);
  return NextResponse.json({ ok: true });
}
