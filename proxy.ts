import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import {
  authorizeRoute,
  defaultPathForRole,
  isAdminProtectedPath,
  isAuthPublicPath,
  isStrictAdminRole,
  normalizeCmsRole,
  resolveApiRoutePolicy,
  sectionFromPath,
  shouldConfineRoleToControlPanel,
  type ApiRoutePolicy,
  type CmsRole
} from "@/lib/auth/access-control";
import {
  SESSION_HANDOFF_ROLE_HEADER,
  SESSION_HANDOFF_USER_HEADER,
  SESSION_HANDOFF_VERIFIED_HEADER
} from "@/lib/auth/session-handoff";
import { buildContentSecurityPolicyForPath, generateCspNonce } from "@/lib/csp";
import { supabaseFetch } from "@/lib/fetch-with-timeout";
import { resolveSupabaseCookieOptions, resolveSupabasePublishableKey } from "@/lib/supabase/cookie-config";
import { getCanonicalProductionOrigin, isObsoleteAppHost } from "@/lib/site-url";
import { extractSecurityCorrelationId, recordSecurityEventFromMiddleware } from "@/services/security-observability";
import { hasSupabaseAuthCookie } from "@/lib/auth/supabase-session-cookie";
import {
  isProfileCompletionExemptPath,
  isProfileIdentityComplete
} from "@/lib/auth/profile-identity";
import {
  buildLoginRedirectPath,
  buildProfileCompletionRedirectPath,
  resolveIntendedAuthNext
} from "@/lib/auth/redirects";
import { CUSTOMER_AUTH_HOME } from "@/lib/auth/guest-auth";
import { getCachedJson, REDIS_CACHE_KEYS, setCachedJson } from "@/lib/cache-redis";

const DEFAULT_SESSION_TIMEOUT_MINUTES = 60;

function applyRequestSecurityHeaders(request: NextRequest) {
  const nonce = generateCspNonce();
  const requestHeaders = new Headers(request.headers);
  // Strip any client-supplied session handoff headers. These are trusted
  // downstream (getCurrentAuthContext, control-plane layouts) as a verified
  // role hint, so they must only ever be set by this proxy after the DB-backed
  // role has been resolved — never forwarded from an inbound request.
  requestHeaders.delete(SESSION_HANDOFF_USER_HEADER);
  requestHeaders.delete(SESSION_HANDOFF_ROLE_HEADER);
  requestHeaders.delete(SESSION_HANDOFF_VERIFIED_HEADER);
  requestHeaders.set("x-nonce", nonce);
  return { nonce, requestHeaders };
}

function withContentSecurityPolicy(response: NextResponse, nonce: string, pathname = "") {
  response.headers.set("Content-Security-Policy", buildContentSecurityPolicyForPath(pathname, nonce));
  return response;
}

function secureNextResponse(request: NextRequest) {
  const { nonce, requestHeaders } = applyRequestSecurityHeaders(request);
  return withContentSecurityPolicy(
    NextResponse.next({ request: { headers: requestHeaders } }),
    nonce,
    request.nextUrl.pathname
  );
}

function secureRedirectResponse(request: NextRequest, url: URL | string) {
  const { nonce } = applyRequestSecurityHeaders(request);
  return withContentSecurityPolicy(NextResponse.redirect(url), nonce, request.nextUrl.pathname);
}

async function redirectAfterSystemLogout(
  request: NextRequest,
  reason: "session_idle" | "session_revoked" | "disabled"
) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("logout_status", "signed_out");
  loginUrl.searchParams.set("logout_reason", reason);
  const redirectResponse = secureRedirectResponse(request, loginUrl);
  const supabase = createSupabaseOnRequest(request, redirectResponse);
  await supabase.auth.signOut();
  return redirectResponse;
}

function sessionTimeoutMs() {
  const configured = Number(process.env.SESSION_TIMEOUT_MINUTES ?? DEFAULT_SESSION_TIMEOUT_MINUTES);
  const minutes = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SESSION_TIMEOUT_MINUTES;
  return minutes * 60_000;
}

function createSupabaseOnRequest(request: NextRequest, response: NextResponse) {
  const publishableKey = resolveSupabasePublishableKey();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey,
    {
      cookieOptions: resolveSupabaseCookieOptions(),
      global: {
        fetch: supabaseFetch()
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );
}

function secureJsonResponse(request: NextRequest, body: Record<string, unknown>, status: number, correlationId?: string) {
  const { nonce } = applyRequestSecurityHeaders(request);
  const response = withContentSecurityPolicy(NextResponse.json(body, { status }), nonce, request.nextUrl.pathname);
  if (correlationId) response.headers.set("x-correlation-id", correlationId);
  return response;
}

async function resolveRequestRole(supabase: ReturnType<typeof createSupabaseOnRequest>, claims: Record<string, unknown>) {
  const appMetadata = claims.app_metadata;
  const userMetadata = claims.user_metadata;
  const claimsRole = normalizeCmsRole(
    (appMetadata && typeof appMetadata === "object" ? (appMetadata as Record<string, unknown>).role : null)
      ?? (userMetadata && typeof userMetadata === "object" ? (userMetadata as Record<string, unknown>).role : null)
  );
  const { data: dbRole, error: roleError } = await supabase.rpc("current_enterprise_role");
  if (roleError) {
    return { role: null as ReturnType<typeof normalizeCmsRole>, claimsRole, roleError };
  }
  return { role: normalizeCmsRole(dbRole), claimsRole, roleError: null };
}

type ProfileGateRow = {
  governance_status: string | null;
  session_revoked_at: string | null;
  display_name: string | null;
  full_name: string | null;
  phone: string | null;
};

type ProfileGateLookup = {
  row: ProfileGateRow | null;
  errorMessage: string | null;
};

// Single profiles round trip shared by the governance gate and the identity
// gate — previously each gate issued its own query against the same row.
async function loadProfileGateRow(
  supabase: ReturnType<typeof createSupabaseOnRequest>,
  userId: string
): Promise<ProfileGateLookup> {
  const { data, error } = await supabase
    .from("profiles")
    .select("governance_status,session_revoked_at,display_name,full_name,phone")
    .eq("id", userId)
    .maybeSingle();

  return {
    row: (data as ProfileGateRow | null) ?? null,
    errorMessage: error ? error.message : null
  };
}

type CachedAuthRoleContext = {
  role: ReturnType<typeof normalizeCmsRole>;
  disabled?: boolean;
};

const AUTH_ROLE_CACHE_TTL_SECONDS = 30;

function resolveClaimsRoleFromClaims(claims: Record<string, unknown>) {
  const appMetadata = claims.app_metadata;
  const userMetadata = claims.user_metadata;
  return normalizeCmsRole(
    (appMetadata && typeof appMetadata === "object" ? (appMetadata as Record<string, unknown>).role : null)
      ?? (userMetadata && typeof userMetadata === "object" ? (userMetadata as Record<string, unknown>).role : null)
  );
}

async function resolveRoleAndProfileWithAuthRoleCache(params: {
  supabase: ReturnType<typeof createSupabaseOnRequest>;
  claims: Record<string, unknown>;
  pathname: string;
  userId: string | null;
  sessionIat: number | null;
}): Promise<{
  roleResolution: Awaited<ReturnType<typeof resolveRequestRole>>;
  profileLookup: ProfileGateLookup | null;
  usedAuthRoleCache: boolean;
  authCacheKey: string | null;
}> {
  const { supabase, claims, pathname, userId, sessionIat } = params;
  const authCacheKey = userId && sessionIat ? REDIS_CACHE_KEYS.authRoleContext(userId, sessionIat) : null;

  if (authCacheKey) {
    const cached = await getCachedJson<CachedAuthRoleContext>(authCacheKey);
    if (cached) {
      const claimsRole = resolveClaimsRoleFromClaims(claims);

      // If the cache says "disabled/revoked", still fall back to DB-backed
      // role + profile so we can reliably compute the exact logout reason.
      if (cached.disabled || !cached.role) {
        const [roleResolution, profileLookup] = await Promise.all([
          resolveRequestRole(supabase, claims),
          userId ? loadProfileGateRow(supabase, userId) : Promise.resolve(null as ProfileGateLookup | null)
        ]);
        return { roleResolution, profileLookup, usedAuthRoleCache: false, authCacheKey };
      }

      const role = cached.role;
      const needIdentityGate = role === "user" && !isProfileCompletionExemptPath(pathname);
      const profileLookup = userId && needIdentityGate
        ? await loadProfileGateRow(supabase, userId)
        : null;

      return {
        roleResolution: { role, claimsRole, roleError: null },
        profileLookup,
        usedAuthRoleCache: true,
        authCacheKey
      };
    }
  }

  const [roleResolution, profileLookup] = await Promise.all([
    resolveRequestRole(supabase, claims),
    userId ? loadProfileGateRow(supabase, userId) : Promise.resolve(null as ProfileGateLookup | null)
  ]);

  return { roleResolution, profileLookup, usedAuthRoleCache: false, authCacheKey };
}

function validateActiveProfile(gate: ProfileGateLookup, sessionIat: number | null) {
  if (gate.errorMessage) {
    console.warn("[mithron-proxy] Profile gate query failed — blocking session.", gate.errorMessage);
    return { blocked: true as const, reason: "disabled" as const };
  }

  if (gate.row?.governance_status === "disabled") {
    return { blocked: true as const, reason: "disabled" as const };
  }

  const revokedAt = gate.row?.session_revoked_at ? Date.parse(String(gate.row.session_revoked_at)) : NaN;
  if (sessionIat && Number.isFinite(revokedAt) && sessionIat * 1000 < revokedAt) {
    return { blocked: true as const, reason: "session_revoked" as const };
  }

  return { blocked: false as const };
}

function validateProfileIdentityGate(
  gate: ProfileGateLookup,
  pathname: string,
  role: CmsRole | null
) {
  // Profile completion is customers only — staff skip entirely.
  if (role !== "user") {
    return { incomplete: false as const };
  }

  if (isProfileCompletionExemptPath(pathname)) {
    return { incomplete: false as const };
  }

  if (gate.errorMessage) {
    console.warn("[mithron-proxy] Profile identity gate query failed — blocking incomplete check.", gate.errorMessage);
    return { incomplete: true as const };
  }

  if (!gate.row || !isProfileIdentityComplete(gate.row)) {
    return { incomplete: true as const };
  }

  return { incomplete: false as const };
}

function redirectToProfileCompletion(request: NextRequest) {
  const intended = resolveIntendedAuthNext(
    request.nextUrl.pathname,
    request.nextUrl.searchParams,
    CUSTOMER_AUTH_HOME
  );
  return secureRedirectResponse(request, new URL(
    buildProfileCompletionRedirectPath(intended),
    request.nextUrl.origin
  ));
}

function redirectToLogin(
  request: NextRequest,
  extraParams?: Record<string, string>
) {
  const intended = resolveIntendedAuthNext(
    request.nextUrl.pathname,
    request.nextUrl.searchParams,
    CUSTOMER_AUTH_HOME
  );
  return secureRedirectResponse(
    request,
    new URL(buildLoginRedirectPath(intended, extraParams), request.nextUrl.origin)
  );
}

function redirectToRoleHome(request: NextRequest, role: ReturnType<typeof normalizeCmsRole>, statusKey: "access_status" | "admin_status", statusValue: string) {
  const panelUrl = request.nextUrl.clone();
  panelUrl.pathname = defaultPathForRole(role);
  panelUrl.search = "";
  panelUrl.searchParams.set(statusKey, statusValue);
  return secureRedirectResponse(request, panelUrl);
}

function isSessionGatedApiPolicy(apiPolicy: ApiRoutePolicy | null) {
  return apiPolicy?.kind === "session" || apiPolicy?.kind === "admin" || apiPolicy?.kind === "staff";
}

async function terminateSessionForRequest(
  request: NextRequest,
  reason: "session_idle" | "session_revoked" | "disabled",
  apiPolicy: ApiRoutePolicy | null
) {
  if (isSessionGatedApiPolicy(apiPolicy)) {
    const correlationId = extractSecurityCorrelationId(request.headers, "api");
    const logoutResponse = secureJsonResponse(
      request,
      { error: "Your sign-in ended. Please sign in again.", logout_reason: reason, retryable: false },
      401,
      correlationId
    );
    const supabase = createSupabaseOnRequest(request, logoutResponse);
    await supabase.auth.signOut();
    return logoutResponse;
  }

  return redirectAfterSystemLogout(request, reason);
}

// The handoff must be injected onto the *request* headers so it reaches the
// downstream Server Components via headers(); response headers are only sent to
// the browser and never reach the RSC. We rebuild the forwarded response with
// the verified handoff and carry over any cookies Supabase refreshed on the
// original response so the session is preserved.
function applySessionHandoff(
  request: NextRequest,
  requestHeaders: Headers,
  nonce: string,
  previous: NextResponse,
  userId: string | null,
  role: ReturnType<typeof normalizeCmsRole>
) {
  if (!userId || !role) return previous;

  requestHeaders.set(SESSION_HANDOFF_USER_HEADER, userId);
  requestHeaders.set(SESSION_HANDOFF_ROLE_HEADER, role);
  requestHeaders.set(SESSION_HANDOFF_VERIFIED_HEADER, "1");

  const response = withContentSecurityPolicy(
    NextResponse.next({ request: { headers: requestHeaders } }),
    nonce,
    request.nextUrl.pathname
  );

  previous.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  const correlationId = previous.headers.get("x-correlation-id");
  if (correlationId) response.headers.set("x-correlation-id", correlationId);

  return response;
}

function maybeRedirectObsoleteDeploymentHost(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") return null;

  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    ?? request.headers.get("host")?.trim();
  if (!host || !isObsoleteAppHost(host)) return null;

  const destination = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    getCanonicalProductionOrigin()
  );
  return secureRedirectResponse(request, destination);
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  try {
    return await handleProxyRequest(request, event);
  } catch (error) {
    const pathname = request.nextUrl.pathname;
    const apiPolicy = resolveApiRoutePolicy(pathname);
    const message = error instanceof Error ? error.message : "Edge middleware failure.";
    console.error("[mithron-proxy] Unhandled middleware error.", { pathname, message });

    if (apiPolicy) {
      const correlationId = extractSecurityCorrelationId(request.headers, "edge");
      return secureJsonResponse(
        request,
        { error: "Service temporarily unavailable.", retryable: true },
        503,
        correlationId
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("auth_status", "service_unavailable");
    return secureRedirectResponse(request, loginUrl);
  }
}

async function handleProxyRequest(request: NextRequest, event: NextFetchEvent) {
  const obsoleteHostRedirect = maybeRedirectObsoleteDeploymentHost(request);
  if (obsoleteHostRedirect) return obsoleteHostRedirect;

  const pathname = request.nextUrl.pathname;
  const authCode = request.nextUrl.searchParams.get("code");
  if (authCode && pathname !== "/auth/callback") {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = "/auth/callback";
    return secureRedirectResponse(request, callbackUrl);
  }

  // OAuth PKCE exchange must run in the auth callback route without middleware
  // touching Supabase cookies first — otherwise code_verifier no longer matches.
  if (pathname === "/auth/callback" || pathname === "/auth/confirm") {
    return secureNextResponse(request);
  }

  if (
    pathname.startsWith("/_next/static")
    || pathname.startsWith("/_next/image")
    || pathname.startsWith("/favicon")
    || pathname === "/api/health"
  ) {
    return NextResponse.next();
  }

  // Guest-demo UI may soft-hide account CTAs, but login and account must stay reachable.

  const { nonce, requestHeaders } = applyRequestSecurityHeaders(request);
  const response = withContentSecurityPolicy(
    NextResponse.next({ request: { headers: requestHeaders } }),
    nonce,
    pathname
  );
  const apiPolicy = resolveApiRoutePolicy(pathname);
  const shouldProtect = isAdminProtectedPath(pathname) && !isAuthPublicPath(pathname);

  if (apiPolicy?.kind === "public") {
    return response;
  }

  // Anonymous public storefront pages skip Supabase auth round-trips entirely.
  if (!shouldProtect && !apiPolicy && !hasSupabaseAuthCookie(request.cookies.getAll())) {
    return response;
  }

  const supabase = createSupabaseOnRequest(request, response);

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (apiPolicy) {
    const correlationId = extractSecurityCorrelationId(request.headers, "api");
    if (apiPolicy.kind === "bearer" || apiPolicy.kind === "upload_token" || apiPolicy.kind === "session_or_guest") {
      return response;
    }

    if (!claims) {
      event.waitUntil(recordSecurityEventFromMiddleware(request, {
        correlationId,
        eventType: error ? "security.invalid_jwt" : "security.api_auth_required",
        attemptedResource: `${pathname}${request.nextUrl.search}`,
        denialReason: "API route requires an authenticated Supabase session.",
        routePath: pathname,
        httpStatus: 401,
        severity: error ? "warning" : "notice",
        source: "middleware",
        metadata: { api_policy: apiPolicy.kind, auth_error: error?.message ?? null }
      }));
      return secureJsonResponse(request, { error: "Please sign in to continue." }, 401, correlationId);
    }

    const sessionIat = typeof claims.iat === "number" ? claims.iat : null;
    if (sessionIat && Date.now() - sessionIat * 1000 > sessionTimeoutMs()) {
      return terminateSessionForRequest(request, "session_idle", apiPolicy);
    }

    const userId = typeof claims.sub === "string" ? claims.sub : null;
    const authLookupsStartedAt = Date.now();
    const { roleResolution, profileLookup, usedAuthRoleCache, authCacheKey } = await resolveRoleAndProfileWithAuthRoleCache({
      supabase,
      claims,
      pathname,
      userId,
      sessionIat
    });
    const authLookupsMs = Date.now() - authLookupsStartedAt;
    if (authLookupsMs >= 500) {
      console.warn(`[mithron-proxy] API auth lookups took ${authLookupsMs}ms`, { pathname });
    }

    if (profileLookup) {
      const profileGate = validateActiveProfile(profileLookup, sessionIat);
      if (profileGate.blocked) {
        if (authCacheKey) {
          void setCachedJson(authCacheKey, { role: null, disabled: true }, AUTH_ROLE_CACHE_TTL_SECONDS);
        }
        return terminateSessionForRequest(request, profileGate.reason, apiPolicy);
      }

      const identityGate = validateProfileIdentityGate(profileLookup, pathname, roleResolution.role);
      if (identityGate.incomplete) {
        if (!usedAuthRoleCache && authCacheKey && roleResolution.role) {
          void setCachedJson(
            authCacheKey,
            { role: roleResolution.role, disabled: false },
            AUTH_ROLE_CACHE_TTL_SECONDS
          );
        }
        return secureJsonResponse(
          request,
          { error: "Complete your profile before continuing.", code: "profile_incomplete" },
          403,
          correlationId
        );
      }
    }

    if (roleResolution.roleError || !roleResolution.role) {
      event.waitUntil(recordSecurityEventFromMiddleware(request, {
        correlationId,
        actorUserId: userId,
        actorRole: roleResolution.claimsRole,
        eventType: "security.role_resolution_failed",
        attemptedResource: `${pathname}${request.nextUrl.search}`,
        denialReason: `Unable to resolve DB-backed enterprise role: ${roleResolution.roleError?.message ?? "unknown"}.`,
        routePath: pathname,
        httpStatus: 403,
        severity: "critical",
        source: "middleware",
        metadata: { api_policy: apiPolicy.kind }
      }));
      return secureJsonResponse(request, { error: "Access denied." }, 403, correlationId);
    }

    if (!usedAuthRoleCache && authCacheKey && roleResolution.role) {
      void setCachedJson(authCacheKey, { role: roleResolution.role, disabled: false }, AUTH_ROLE_CACHE_TTL_SECONDS);
    }

    if (apiPolicy.kind === "admin" && !isStrictAdminRole(roleResolution.role)) {
      event.waitUntil(recordSecurityEventFromMiddleware(request, {
        correlationId,
        actorUserId: userId,
        actorRole: roleResolution.role,
        eventType: "security.api_admin_denied",
        attemptedResource: `${pathname}${request.nextUrl.search}`,
        denialReason: `Role ${roleResolution.role} cannot access admin API.`,
        routePath: pathname,
        httpStatus: 403,
        severity: "warning",
        source: "middleware",
        metadata: { api_policy: apiPolicy.kind }
      }));
      return secureJsonResponse(request, { error: "Access denied." }, 403, correlationId);
    }

    if (apiPolicy.kind === "staff" && !["admin", "warehouse", "supplier"].includes(roleResolution.role)) {
      event.waitUntil(recordSecurityEventFromMiddleware(request, {
        correlationId,
        actorUserId: userId,
        actorRole: roleResolution.role,
        eventType: "security.api_staff_denied",
        attemptedResource: `${pathname}${request.nextUrl.search}`,
        denialReason: `Role ${roleResolution.role} cannot access staff API.`,
        routePath: pathname,
        httpStatus: 403,
        severity: "warning",
        source: "middleware",
        metadata: { api_policy: apiPolicy.kind }
      }));
      return secureJsonResponse(request, { error: "Access denied." }, 403, correlationId);
    }

    response.headers.set("x-correlation-id", correlationId);
    return response;
  }

  if (!shouldProtect) {
    if (claims) {
      const userId = typeof claims.sub === "string" ? claims.sub : null;
      const sessionIat = typeof claims.iat === "number" ? claims.iat : null;
      const authLookupsStartedAt = Date.now();
      const { roleResolution, profileLookup, usedAuthRoleCache, authCacheKey } = await resolveRoleAndProfileWithAuthRoleCache({
        supabase,
        claims,
        pathname,
        userId,
        sessionIat
      });
      const authLookupsMs = Date.now() - authLookupsStartedAt;
      if (authLookupsMs >= 500) {
        console.warn(`[mithron-proxy] Public-route auth lookups took ${authLookupsMs}ms`, { pathname });
      }
      const role = roleResolution.role;

      if (!usedAuthRoleCache && authCacheKey && role) {
        void setCachedJson(authCacheKey, { role, disabled: false }, AUTH_ROLE_CACHE_TTL_SECONDS);
      }

      if (shouldConfineRoleToControlPanel(role, pathname)) {
        return redirectToRoleHome(request, role, "access_status", "control_panel_only");
      }

      if (userId && role === "user" && !isProfileCompletionExemptPath(pathname) && profileLookup) {
        const identityGate = validateProfileIdentityGate(profileLookup, pathname, role);
        if (identityGate.incomplete) {
          return redirectToProfileCompletion(request);
        }
      }
    }

    return response;
  }

  const correlationId = extractSecurityCorrelationId(request.headers, "route");

  if (!claims) {
    const invalidJwt = Boolean(error);
    event.waitUntil(recordSecurityEventFromMiddleware(request, {
      correlationId,
      eventType: invalidJwt ? "security.invalid_jwt" : "security.auth_required",
      attemptedResource: `${pathname}${request.nextUrl.search}`,
      denialReason: invalidJwt
        ? `Invalid Supabase session: ${error?.message ?? "claims unavailable"}.`
        : "Protected route requires an authenticated Supabase session.",
      routePath: pathname,
      httpStatus: 401,
      severity: invalidJwt ? "warning" : "notice",
      source: "middleware",
      metadata: { section: sectionFromPath(pathname), auth_error: error?.message ?? null }
    }));
    const redirectResponse = redirectToLogin(request);
    redirectResponse.headers.set("x-correlation-id", correlationId);
    return redirectResponse;
  }

  const sessionIat = typeof claims.iat === "number" ? claims.iat : null;
  if (sessionIat && Date.now() - sessionIat * 1000 > sessionTimeoutMs()) {
    return redirectAfterSystemLogout(request, "session_idle");
  }

  const userId = typeof claims.sub === "string" ? claims.sub : null;

  const authLookupsStartedAt = Date.now();
  const { roleResolution, profileLookup, usedAuthRoleCache, authCacheKey } = await resolveRoleAndProfileWithAuthRoleCache({
    supabase,
    claims,
    pathname,
    userId,
    sessionIat
  });
  const authLookupsMs = Date.now() - authLookupsStartedAt;
  if (authLookupsMs >= 500) {
    console.warn(`[mithron-proxy] Protected-route auth lookups took ${authLookupsMs}ms`, { pathname });
  }

  if (profileLookup) {
    const profileGate = validateActiveProfile(profileLookup, sessionIat);
    if (profileGate.blocked) {
      if (authCacheKey) {
        void setCachedJson(authCacheKey, { role: null, disabled: true }, AUTH_ROLE_CACHE_TTL_SECONDS);
      }
      if (profileGate.reason === "session_revoked") {
        return redirectAfterSystemLogout(request, "session_revoked");
      }
      if (profileGate.reason === "disabled") {
        return redirectAfterSystemLogout(request, "disabled");
      }
      return redirectAfterSystemLogout(request, "session_idle");
    }
  }

  if (roleResolution.roleError || !roleResolution.role) {
    event.waitUntil(recordSecurityEventFromMiddleware(request, {
      correlationId,
      actorUserId: userId,
      actorRole: roleResolution.claimsRole,
      eventType: "security.role_resolution_failed",
      attemptedResource: `${pathname}${request.nextUrl.search}`,
      denialReason: `Unable to resolve DB-backed enterprise role: ${roleResolution.roleError?.message ?? "unknown"}.`,
      routePath: pathname,
      httpStatus: 403,
      severity: "critical",
      source: "middleware",
      metadata: { section: sectionFromPath(pathname), claims_role: roleResolution.claimsRole }
    }));
    const redirectResponse = redirectToLogin(request, { auth_status: "role_resolution_failed" });
    redirectResponse.headers.set("x-correlation-id", correlationId);
    return redirectResponse;
  }

  const role = roleResolution.role;

  if (!usedAuthRoleCache && authCacheKey && role) {
    void setCachedJson(authCacheKey, { role, disabled: false }, AUTH_ROLE_CACHE_TTL_SECONDS);
  }

  if (profileLookup) {
    const identityGate = validateProfileIdentityGate(profileLookup, pathname, role);
    if (identityGate.incomplete) {
      return redirectToProfileCompletion(request);
    }
  }

  if (shouldConfineRoleToControlPanel(role, pathname)) {
    return redirectToRoleHome(request, role, "access_status", "control_panel_only");
  }

  const authorization = authorizeRoute(role, pathname, { userId });
  if (!authorization.allowed) {
    const forbiddenUrl = request.nextUrl.clone();
    forbiddenUrl.pathname = authorization.redirectPath;
    forbiddenUrl.search = "";
    if (authorization.httpStatus === 403) {
      forbiddenUrl.searchParams.set(
        authorization.eventType === "security.admin_shell_denied" ? "admin_status" : "access_status",
        "forbidden"
      );
      forbiddenUrl.searchParams.set(
        "next",
        resolveIntendedAuthNext(pathname, request.nextUrl.searchParams, defaultPathForRole(role))
      );
    }
    event.waitUntil(recordSecurityEventFromMiddleware(request, {
      correlationId,
      actorUserId: userId,
      actorRole: role,
      eventType: authorization.eventType,
      attemptedResource: `${pathname}${request.nextUrl.search}`,
      denialReason: authorization.reason,
      routePath: pathname,
      httpStatus: authorization.httpStatus,
      severity: authorization.eventType === "security.admin_shell_denied" ? "critical" : "warning",
      source: "middleware",
      metadata: { section: sectionFromPath(pathname) }
    }));
    const redirectResponse = secureRedirectResponse(request, forbiddenUrl);
    redirectResponse.headers.set("x-correlation-id", correlationId);
    return redirectResponse;
  }

  response.headers.set("x-correlation-id", correlationId);
  return applySessionHandoff(request, requestHeaders, nonce, response, userId, role);
}

export const config = {
  // Page and API routes are RBAC-gated here. Bearer/upload routes still verify secrets in handlers.
  // Static assets, robots, and sitemap skip the edge auth path entirely.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|css|js|map)$).*)"
  ]
};
