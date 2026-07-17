import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeCmsRole } from "@/lib/auth/permissions";
import { supabaseFetch } from "@/lib/fetch-with-timeout";
import { recordAuthActivityEvent } from "@/services/security-observability";

const SYSTEM_LOGOUT_REASONS = new Set(["session_idle", "session_revoked", "disabled"]);

function loginRedirectUrl(request: NextRequest, params?: Record<string, string>) {
  const loginUrl = new URL("/login", request.url);
  for (const [key, value] of Object.entries(params ?? {})) {
    loginUrl.searchParams.set(key, value);
  }
  return loginUrl;
}

function resolvePublishableKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )!;
}

function createLogoutClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    resolvePublishableKey(),
    {
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

async function performLogout(request: NextRequest, response: NextResponse) {
  const supabase = createLogoutClient(request, response);
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  await recordAuthActivityEvent(
    {
      action: "auth.logout",
      actorUserId: typeof claims?.sub === "string" ? claims.sub : null,
      actorRole: normalizeCmsRole(claims?.app_metadata?.role ?? claims?.user_metadata?.role),
      sessionIdentifier: typeof claims?.session_id === "string" ? claims.session_id : null,
      authProvider: "supabase"
    },
    request
  ).catch((error) => console.error("[mithron-auth] Failed to log auth.logout.", error));

  await supabase.auth.signOut();
}

export async function POST(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get("reason");
  const redirectUrl = new URL("/", request.url);
  redirectUrl.searchParams.set("logout_status", "signed_out");
  if (reason) {
    redirectUrl.searchParams.set("logout_reason", reason);
  }
  const response = NextResponse.redirect(redirectUrl, { status: 303 });
  await performLogout(request, response);
  return response;
}

export async function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get("reason");

  if (reason && SYSTEM_LOGOUT_REASONS.has(reason)) {
    return NextResponse.redirect(
      loginRedirectUrl(request, {
        logout_notice: "Use the sign out button to end your session.",
        logout_reason: reason
      })
    );
  }

  return NextResponse.redirect(
    loginRedirectUrl(request, {
      logout_notice: "Use the sign out button to end your session.",
      ...(reason ? { logout_reason: reason } : {})
    })
  );
}
