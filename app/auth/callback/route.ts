import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { GUEST_AUTH_HOME } from "@/lib/auth/guest-auth";
import { resolvePostAuthRedirectWithProfileCheck } from "@/lib/auth/post-auth-redirect";
import { buildLoginRedirectPath, unwrapAuthNextPath } from "@/lib/auth/redirects";
import { createAuthRouteClient } from "@/lib/server";
import { resolveInviteRoleForUser } from "@/services/auth-invite";
import { provisionAuthenticatedUserIfMissing, syncGuestProfileFromIdentity } from "@/services/auth-provisioning";
import { resolveOperatorRoleForEmail } from "@/services/demo-access-accounts";
import { recordAuthActivityEvent } from "@/services/security-observability";

function resolveOAuthProvider(user: User) {
  const identity = user.identities?.find((entry) => entry.provider && entry.provider !== "email");
  return identity?.provider ?? "oauth";
}

function loginFailureRedirect(request: NextRequest, authError: string, nextPath: string) {
  return new URL(
    buildLoginRedirectPath(nextPath, { auth_error: authError }),
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
  const oauthError = requestUrl.searchParams.get("error");
  const oauthErrorDescription = requestUrl.searchParams.get("error_description");
  const code = requestUrl.searchParams.get("code");
  const next = unwrapAuthNextPath(requestUrl.searchParams.get("next"), GUEST_AUTH_HOME);
  const { supabase, applySessionCookies } = await createAuthRouteClient();

  if (oauthError) {
    console.warn("[mithron-auth] OAuth callback error.", oauthError, oauthErrorDescription);
    return applySessionCookies(
      NextResponse.redirect(loginFailureRedirect(request, oauthError, next))
    );
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.warn("[mithron-auth] OAuth code exchange failed.", {
        message: error.message,
        status: error.status,
        code: error.code
      });
      const failureUrl = loginFailureRedirect(request, "verification_failed", next);
      failureUrl.searchParams.delete("code");
      return applySessionCookies(
        NextResponse.redirect(failureUrl)
      );
    }
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return applySessionCookies(
      NextResponse.redirect(loginFailureRedirect(request, "session_missing", next))
    );
  }

  const user = userData.user;
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
  }).catch((error) => {
    console.warn("[mithron-auth] Invite resolution failed.", error);
    return null;
  });

  const operatorRole = await resolveOperatorRoleForEmail(user.email ?? "").catch(() => null);

  const displayName = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : typeof user.user_metadata?.display_name === "string"
        ? user.user_metadata.display_name
        : user.email;

  try {
    await provisionAuthenticatedUserIfMissing({
      userId: user.id,
      email: user.email,
      displayName,
      fullName: displayName ?? undefined,
      avatarUrl: typeof user.user_metadata?.avatar_url === "string"
        ? user.user_metadata.avatar_url
        : typeof user.user_metadata?.picture === "string"
          ? user.user_metadata.picture
          : undefined,
      emailConfirmedAt: user.email_confirmed_at ?? null,
      preferredRole: inviteRole ?? operatorRole ?? "user"
    });
  } catch (error) {
    console.warn("[mithron-auth] OAuth callback provisioning failed.", error);
    return failAuthProvisioning(request, supabase, applySessionCookies, next);
  }

  await syncGuestProfileFromIdentity({
    userId: user.id,
    email: user.email,
    displayName,
    fullName: displayName ?? undefined,
    avatarUrl: typeof user.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : typeof user.user_metadata?.picture === "string"
        ? user.user_metadata.picture
        : undefined
  }).catch((error) => {
    console.warn("[mithron-auth] OAuth profile sync failed.", error);
  });

  const { data: role, error: roleError } = await supabase.rpc("current_enterprise_role");
  if (roleError || !role) {
    return applySessionCookies(
      NextResponse.redirect(new URL("/login?auth_status=role_required", request.nextUrl.origin))
    );
  }

  const redirectPath = await resolvePostAuthRedirectWithProfileCheck({
    user,
    role,
    nextPath: next
  });
  const authProvider = resolveOAuthProvider(user);

  await recordAuthActivityEvent({
    action: "auth.login",
    actorUserId: user.id,
    actorRole: role,
    sessionIdentifier: null,
    authProvider,
    severity: "info",
    metadata: { email: user.email, user_id: user.id, provider: authProvider }
  }, request).catch((error) => {
    console.warn("[mithron-auth] OAuth login audit failed.", error);
  });

  return applySessionCookies(
    NextResponse.redirect(new URL(redirectPath, request.nextUrl.origin))
  );
}
