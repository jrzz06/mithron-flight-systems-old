import { NextResponse } from "next/server";
import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";
import { findAuthUserByEmail } from "@/lib/auth/admin-user-lookup";
import { mapOtpSendErrorForClient } from "@/lib/auth/otp-send-errors";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { buildAuthConfirmUrl, resolveRequestOrigin } from "@/lib/auth/request-origin";
import { normalizeSignupEmail, rejectClientSuppliedRole } from "@/lib/auth/signup-validation";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createAuthRouteClient } from "@/lib/server";

type ChangeEmailBody = {
  currentEmail?: unknown;
  newEmail?: unknown;
};

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`auth-change-email:${ip}`, 3, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as ChangeEmailBody;
  const roleError = rejectClientSuppliedRole(body as Record<string, unknown>);
  if (roleError) {
    return NextResponse.json({ error: roleError }, { status: 400 });
  }

  const currentEmail = typeof body.currentEmail === "string" ? normalizeSignupEmail(body.currentEmail) : "";
  const newEmail = typeof body.newEmail === "string" ? normalizeSignupEmail(body.newEmail) : "";

  if (!currentEmail || !newEmail) {
    return NextResponse.json({ error: "Current and new email are required." }, { status: 400 });
  }

  if (currentEmail === newEmail) {
    return NextResponse.json({ error: "New email must be different from the current email." }, { status: 400 });
  }

  const config = assertSupabaseAdminConfig();
  const admin = createSupabaseServiceClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  let user;
  try {
    user = await findAuthUserByEmail(admin, currentEmail);
  } catch (lookupError) {
    console.error("[mithron-auth] Change-email lookup failed.", lookupError);
    return NextResponse.json({ error: "Unable to update email right now. Please try again." }, { status: 500 });
  }

  if (!user || user.email_confirmed_at) {
    return NextResponse.json(
      { error: "Unable to update email. Verify your current address or sign in if already verified." },
      { status: 400 }
    );
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    email: newEmail,
    email_confirm: false
  });

  if (updateError) {
    return NextResponse.json(
      { error: "Unable to update email. It may already be in use." },
      { status: 400 }
    );
  }

  const origin = resolveRequestOrigin(request);
  const emailRedirectTo = buildAuthConfirmUrl(origin, "/account");
  const { supabase } = await createAuthRouteClient();

  const { error: resendError } = await supabase.auth.resend({
    type: "signup",
    email: newEmail,
    options: { emailRedirectTo }
  });

  if (resendError) {
    console.warn("[mithron-auth] Change-email verification resend failed.", resendError.message);
    return NextResponse.json(
      { error: mapOtpSendErrorForClient(resendError) },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, email: newEmail });
}
