import { NextResponse } from "next/server";
import { verifyAuthAuditClientToken } from "@/lib/auth-audit-client";
import { mapAuthErrorForClient } from "@/lib/auth/client-errors";
import { ProfileDisabledError } from "@/lib/auth/profile-disabled";
import { resolvePostAuthRedirectWithProfileCheck } from "@/lib/auth/post-auth-redirect";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createAuthRouteClient } from "@/lib/server";
import {
  assertLoginNotLockedForIdentifiers,
  clearLoginFailuresForIdentifiers,
  LoginLockedOutError,
  recordLoginFailures
} from "@/services/auth-lockout";
import { resolveInviteRoleForUser } from "@/services/auth-invite";
import { provisionAuthenticatedUserIfMissing } from "@/services/auth-provisioning";
import { resolveOperatorRoleForEmail } from "@/services/demo-access-accounts";
import { recordAuthActivityEvent } from "@/services/security-observability";

type LoginRequestBody = {
  email?: unknown;
  password?: unknown;
  next?: unknown;
};

function readLoginBody(body: LoginRequestBody) {
  return {
    email: typeof body.email === "string" ? body.email.trim().toLowerCase() : "",
    password: typeof body.password === "string" ? body.password : "",
    nextPath: typeof body.next === "string" ? body.next : ""
  };
}

export async function POST(request: Request) {
  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`auth-login:${rateKey}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: mapAuthErrorForClient("too many requests") }, { status: 429 });
  }

  const { email, password, nextPath } = readLoginBody(await request.json().catch(() => ({})));
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    await assertLoginNotLockedForIdentifiers([email, rateKey]);
  } catch (error) {
    if (error instanceof LoginLockedOutError) {
      return NextResponse.json({ error: mapAuthErrorForClient(error) }, { status: 429 });
    }
    throw error;
  }

  const { supabase, applySessionCookies } = await createAuthRouteClient();
  const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    const unconfirmed = signInError.message.toLowerCase().includes("email not confirmed")
      || signInError.message.toLowerCase().includes("email_not_confirmed");
    if (unconfirmed) {
      return NextResponse.json({
        error: "Please verify your email before signing in.",
        code: "verification_pending",
        email
      }, { status: 403 });
    }

    // Bump only (no peek) — combined email + IP keys; use bump remaining/locked
    // so a raced ceiling cross can 429 without an extra round-trip.
    const failureStates = await recordLoginFailures([email, rateKey]);
    const lockedAfterBump = failureStates.some((state) => !state.allowed);
    const clientToken = request.headers.get("x-auth-audit-token")
      ?? request.headers.get("x-turnstile-token");
    if (verifyAuthAuditClientToken(clientToken)) {
      await recordAuthActivityEvent({
        action: "auth.failed_login",
        actorUserId: null,
        actorRole: null,
        sessionIdentifier: null,
        authProvider: "supabase",
        severity: "warning",
        metadata: { email, error: signInError.message, provider: "supabase" }
      }, request);
    }
    if (lockedAfterBump) {
      return NextResponse.json({ error: mapAuthErrorForClient(new LoginLockedOutError()) }, { status: 429 });
    }
    return NextResponse.json({ error: mapAuthErrorForClient(signInError) }, { status: 401 });
  }

  const user = data.user;

  const isOAuthUser = user.identities?.some(
    (identity) => identity.provider === "google" || identity.provider === "github"
  ) ?? false;

  if (!user.email_confirmed_at && !isOAuthUser) {
    await supabase.auth.signOut();
    return NextResponse.json({
      error: "Please verify your email before signing in.",
      code: "verification_pending",
      email: user.email ?? email
    }, { status: 403 });
  }

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
      displayName: typeof user.user_metadata?.display_name === "string"
        ? user.user_metadata.display_name
        : typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : user.email,
      fullName: typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : undefined,
      phone: typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : undefined,
      preferredRole: inviteRole ?? operatorRole ?? "user"
    });
  } catch (error) {
    if (error instanceof ProfileDisabledError) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: mapAuthErrorForClient(error) }, { status: 403 });
    }

    console.error("[mithron-auth] Login provisioning failed.", error);
    return NextResponse.json({ error: mapAuthErrorForClient(error) }, { status: 500 });
  }

  const { data: role, error: roleError } = await supabase.rpc("current_enterprise_role");
  if (roleError || !role) {
    console.error("[mithron-auth] Role resolution failed during login.", roleError);
    return NextResponse.json({ error: mapAuthErrorForClient("role could not be loaded") }, { status: 500 });
  }

  await clearLoginFailuresForIdentifiers([email, rateKey]);

  await recordAuthActivityEvent({
    action: "auth.login",
    actorUserId: user.id,
    actorRole: role,
    sessionIdentifier: data.session?.access_token ? data.session.access_token.slice(0, 12) : null,
    authProvider: "supabase",
    severity: "info",
    metadata: { email: user.email ?? email, user_id: user.id, provider: "supabase" }
  }, request);

  return applySessionCookies(NextResponse.json({
    ok: true,
    role,
    redirectPath: await resolvePostAuthRedirectWithProfileCheck({ user, role, nextPath })
  }));
}
