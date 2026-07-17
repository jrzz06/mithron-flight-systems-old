import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { GUEST_AUTH_HOME } from "@/lib/auth/guest-auth";
import { resolvePostAuthRedirectWithProfileCheck } from "@/lib/auth/post-auth-redirect";
import { buildLoginRedirectPath, unwrapAuthNextPath } from "@/lib/auth/redirects";
import { createAuthRouteClient } from "@/lib/server";
import { resolveInviteRoleForUser } from "@/services/auth-invite";
import { provisionAuthenticatedUserIfMissing } from "@/services/auth-provisioning";
import { resolveOperatorRoleForEmail } from "@/services/demo-access-accounts";
import { recordAuthActivityEvent } from "@/services/security-observability";

function loginFailureRedirect(request: NextRequest, nextPath: string) {
  return new URL(
    buildLoginRedirectPath(nextPath, { auth_error: "verification_failed" }),
    request.nextUrl.origin
  );
}

async function failAuthProvisioning(
  request: NextRequest,
  supabase: Awaited<ReturnType<typeof createAuthRouteClient>>["supabase"],
  applySessionCookies: Awaited<ReturnType<typeof createAuthRouteClient>>["applySessionCookies"],
  nextPath: string
) {
  await supabase.auth.signOut();
  return applySessionCookies(
    NextResponse.redirect(
      new URL(buildLoginRedirectPath(nextPath, { auth_status: "provisioning_failed" }), request.nextUrl.origin)
    )
  );
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = unwrapAuthNextPath(requestUrl.searchParams.get("next"), GUEST_AUTH_HOME);
  const { supabase, applySessionCookies } = await createAuthRouteClient();

  if (!tokenHash || !type) {
    return applySessionCookies(
      NextResponse.redirect(loginFailureRedirect(request, next))
    );
  }

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    console.warn("[mithron-auth] Email OTP verification failed.", error.message);
    return applySessionCookies(
      NextResponse.redirect(loginFailureRedirect(request, next))
    );
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return applySessionCookies(
      NextResponse.redirect(loginFailureRedirect(request, next))
    );
  }

  const user = userData.user;
  const displayName = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : user.email;

  const inviteToken = typeof user.user_metadata?.invite_token === "string"
    ? user.user_metadata.invite_token
    : requestUrl.searchParams.get("invite");
  const invitedRole = typeof user.user_metadata?.invited_role === "string"
    ? user.user_metadata.invited_role
    : null;

  const inviteRole = await resolveInviteRoleForUser({
    userId: user.id,
    email: user.email ?? "",
    inviteToken,
    invitedRole
  }).catch((inviteError) => {
    console.warn("[mithron-auth] Invite resolution failed during email confirm.", inviteError);
    return null;
  });

  const operatorRole = await resolveOperatorRoleForEmail(user.email ?? "").catch(() => null);

  try {
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
    console.warn("[mithron-auth] Email confirm provisioning failed.", provisionError);
    return failAuthProvisioning(request, supabase, applySessionCookies, next);
  }

  const { data: role, error: roleError } = await supabase.rpc("current_enterprise_role");
  if (roleError || !role) {
    return applySessionCookies(
      NextResponse.redirect(new URL("/login?auth_status=role_required", request.nextUrl.origin))
    );
  }

  const redirectPath = await resolvePostAuthRedirectWithProfileCheck({ user, role, nextPath: next });

  await recordAuthActivityEvent({
    action: "auth.login",
    actorUserId: user.id,
    actorRole: role,
    sessionIdentifier: null,
    authProvider: "email",
    severity: "info",
    metadata: { email: user.email, user_id: user.id, provider: "email", verified: true }
  }, request).catch((auditError) => {
    console.warn("[mithron-auth] Email confirm audit failed.", auditError);
  });

  return applySessionCookies(
    NextResponse.redirect(new URL(redirectPath, request.nextUrl.origin))
  );
}
