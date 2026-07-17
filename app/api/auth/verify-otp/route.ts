import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { mapAuthErrorForClient } from "@/lib/auth/client-errors";
import { ProfileDisabledError } from "@/lib/auth/profile-disabled";
import { resolvePostAuthRedirectWithProfileCheck } from "@/lib/auth/post-auth-redirect";
import { normalizeSignupEmail, rejectClientSuppliedRole } from "@/lib/auth/signup-validation";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createAuthRouteClient } from "@/lib/server";
import { resolveInviteRoleForUser } from "@/services/auth-invite";
import { provisionAuthenticatedUserIfMissing } from "@/services/auth-provisioning";
import { resolveOperatorRoleForEmail } from "@/services/demo-access-accounts";
import { recordAuthActivityEvent } from "@/services/security-observability";

type VerifyOtpBody = {
  email?: unknown;
  token?: unknown;
  type?: unknown;
  next?: unknown;
};

function readOtpType(value: unknown): EmailOtpType | null {
  if (value === "signup" || value === "email") return value;
  return null;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`auth-verify-otp:${ip}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: mapAuthErrorForClient("too many requests") }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as VerifyOtpBody;
  const clientRoleError = rejectClientSuppliedRole(body as Record<string, unknown>);
  if (clientRoleError) {
    return NextResponse.json({ error: clientRoleError }, { status: 400 });
  }

  const email = typeof body.email === "string" ? normalizeSignupEmail(body.email) : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const type = readOtpType(body.type);
  const nextPath = typeof body.next === "string" ? body.next : "";

  if (!email || !token || !type) {
    return NextResponse.json({ error: "Email, code, and type are required." }, { status: 400 });
  }

  const { supabase, applySessionCookies } = await createAuthRouteClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type });

  if (error) {
    return NextResponse.json({ error: mapAuthErrorForClient(error) }, { status: 400 });
  }

  const user = data.user;
  if (!user) {
    return NextResponse.json({ error: mapAuthErrorForClient("verification failed") }, { status: 400 });
  }

  const displayName = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : user.email;

  try {
    const inviteToken = typeof user.user_metadata?.invite_token === "string" ? user.user_metadata.invite_token : null;
    const invitedRole = typeof user.user_metadata?.invited_role === "string" ? user.user_metadata.invited_role : null;
    const inviteRole = await resolveInviteRoleForUser({
      userId: user.id,
      email: user.email ?? email,
      inviteToken,
      invitedRole
    }).catch(() => null);

    const operatorRole = await resolveOperatorRoleForEmail(user.email ?? email).catch(() => null);

    await provisionAuthenticatedUserIfMissing({
      userId: user.id,
      email: user.email,
      emailConfirmedAt: user.email_confirmed_at ?? null,
      displayName,
      fullName: displayName ?? undefined,
      phone: typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : undefined,
      preferredRole: inviteRole ?? operatorRole ?? "user"
    });
  } catch (provisionError) {
    if (provisionError instanceof ProfileDisabledError) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: mapAuthErrorForClient(provisionError) }, { status: 403 });
    }

    console.error("[mithron-auth] OTP verify provisioning failed.", provisionError);
    return NextResponse.json({ error: mapAuthErrorForClient(provisionError) }, { status: 500 });
  }

  const { data: role, error: roleError } = await supabase.rpc("current_enterprise_role");
  if (roleError || !role) {
    console.error("[mithron-auth] Role resolution failed during OTP verify.", roleError);
    return NextResponse.json({ error: mapAuthErrorForClient("role could not be loaded") }, { status: 500 });
  }

  await recordAuthActivityEvent({
    action: "auth.login",
    actorUserId: user.id,
    actorRole: role,
    sessionIdentifier: data.session?.access_token ? data.session.access_token.slice(0, 12) : null,
    authProvider: type === "email" ? "email" : "supabase",
    severity: "info",
    metadata: { email: user.email ?? email, user_id: user.id, provider: "email", verified: true, otp_type: type }
  }, request).catch((auditError) => {
    console.warn("[mithron-auth] OTP verify audit failed.", auditError);
  });

  return applySessionCookies(NextResponse.json({
    ok: true,
    role,
    redirectPath: await resolvePostAuthRedirectWithProfileCheck({ user, role, nextPath })
  }));
}
