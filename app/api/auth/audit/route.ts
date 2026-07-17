import { NextResponse, type NextRequest } from "next/server";
import { normalizeCmsRole } from "@/lib/auth/permissions";
import { capAuthAuditMetadata, verifyAuthAuditClientToken } from "@/lib/auth-audit-client";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";
import { recordAuthActivityEvent } from "@/services/security-observability";

const allowedAuthAuditEvents = new Set([
  "auth.login",
  "auth.failed_login",
  "auth.password_reset",
  "auth.invite_accept"
]);

const serverOnlyAuthAuditEvents = new Set(["auth.login", "auth.invite_accept"]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { action?: unknown; metadata?: unknown };
  const action = typeof body.action === "string" ? body.action : "";
  if (!allowedAuthAuditEvents.has(action)) {
    return NextResponse.json({ error: "Unsupported auth audit event." }, { status: 400 });
  }
  if (serverOnlyAuthAuditEvents.has(action)) {
    return NextResponse.json({ error: "This event is recorded server-side only." }, { status: 403 });
  }

  const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
    ? capAuthAuditMetadata(body.metadata as Record<string, unknown>)
    : {};
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const actorUserId = typeof claims?.sub === "string" ? claims.sub : null;
  const rateKey = actorUserId ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`auth-audit:${rateKey}`, 10, 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  if (!actorUserId && (action === "auth.failed_login" || action === "auth.password_reset")) {
    const clientToken = request.headers.get("x-auth-audit-token")
      ?? request.headers.get("x-turnstile-token");
    if (!verifyAuthAuditClientToken(clientToken)) {
      return NextResponse.json({ error: "Client verification required." }, { status: 401 });
    }
  }

  const actorRole = normalizeCmsRole(claims?.app_metadata?.role ?? claims?.user_metadata?.role);
  const sessionIdentifier = typeof claims?.session_id === "string" ? claims.session_id : null;

  await recordAuthActivityEvent({
    action: action as "auth.login" | "auth.failed_login" | "auth.password_reset" | "auth.invite_accept",
    actorUserId,
    actorRole,
    sessionIdentifier,
    authProvider: "supabase",
    severity: action === "auth.failed_login" ? "warning" : "info",
    metadata
  }, request);

  return NextResponse.json({ status: "recorded" });
}
