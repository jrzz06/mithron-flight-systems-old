import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/env";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { isControlPanelRole } from "@/lib/auth/access-control";
import { normalizeCmsRole } from "@/lib/auth/permissions";
import { extractSecurityCorrelationId, recordObservedRestDenial, recordSecurityEvent } from "@/services/security-observability";

type JsonRecord = Record<string, unknown>;

const allowedDenialEvents = new Set([
  "security.rest_denied",
  "security.rls_denied",
  "security.denied_mutation",
  "security.privilege_escalation",
  "security.realtime_denied"
]);

function requestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? null;
}

function textField(payload: JsonRecord, key: string, fallback = "") {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberField(payload: JsonRecord, key: string, fallback: number) {
  const value = Number(payload[key] ?? fallback);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function metadataFromPayload(payload: JsonRecord) {
  const metadata = payload.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as JsonRecord
    : {};
}

function sanitizeAttemptedResource(value: string) {
  const trimmed = value.trim().slice(0, 500);
  if (!trimmed || trimmed.includes("\0") || /javascript:/i.test(trimmed)) {
    return "unknown-rest-resource";
  }
  return trimmed;
}

async function authContextFromBearer(request: NextRequest) {
  const config = getSupabasePublicConfig();
  if (!config.configured) {
    throw new Error(config.message);
  }

  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  const supabase = createSupabaseClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    },
    global: authorization ? { headers: { Authorization: authorization } } : undefined
  });

  if (!accessToken) {
    return {
      authenticated: false,
      userId: null,
      role: null,
      claimsRole: null,
      error: "Missing bearer token."
    };
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) {
    return {
      authenticated: false,
      userId: null,
      role: null,
      claimsRole: null,
      error: error?.message ?? "Invalid Supabase session."
    };
  }

  const claimsRole = normalizeCmsRole(data.user.app_metadata?.role ?? data.user.user_metadata?.role);
  const { data: dbRole } = await supabase.rpc("current_enterprise_role");
  return {
    authenticated: true,
    userId: data.user.id,
    role: normalizeCmsRole(dbRole) ?? claimsRole,
    claimsRole,
    error: null
  };
}

export async function POST(request: NextRequest) {
  const correlationId = extractSecurityCorrelationId(request.headers, "denial");
  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`security-denials:${rateKey}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests.", correlationId }, { status: 429 });
  }

  const payload = await request.json().catch(() => ({})) as JsonRecord;
  const auth = await authContextFromBearer(request);

  if (!auth.authenticated) {
    await recordSecurityEvent({
      correlationId,
      eventType: "security.invalid_jwt",
      attemptedResource: textField(payload, "attemptedResource", "/api/security/denials"),
      denialReason: auth.error,
      routePath: "/api/security/denials",
      httpStatus: 401,
      severity: "warning",
      source: "security-denial-api",
      metadata: {
        ip: requestIp(request),
        user_agent: request.headers.get("user-agent"),
        requested_event_type: payload.eventType ?? null
      }
    }).catch((error) => console.error("[mithron-security] Failed to record invalid JWT denial report.", error));
    return NextResponse.json(
      { error: "Unauthorized denial telemetry request.", correlationId },
      { status: 401, headers: { "x-correlation-id": correlationId } }
    );
  }

  if (!isControlPanelRole(auth.role)) {
    return NextResponse.json(
      { error: "Forbidden.", correlationId },
      { status: 403, headers: { "x-correlation-id": correlationId } }
    );
  }

  const requestedEventType = textField(payload, "eventType", "security.rest_denied");
  const eventType = allowedDenialEvents.has(requestedEventType) ? requestedEventType : "security.rest_denied";
  const attemptedResource = sanitizeAttemptedResource(textField(payload, "attemptedResource", "unknown-rest-resource"));
  const httpStatus = numberField(payload, "httpStatus", 403);

  await recordObservedRestDenial({
    actorUserId: auth.userId,
    actorRole: auth.role,
    eventType: eventType as "security.rest_denied",
    attemptedResource,
    denialReason: textField(payload, "denialReason", "Denied Supabase REST/RLS operation observed by application telemetry."),
    routePath: textField(payload, "routePath", "/api/security/denials"),
    httpStatus,
    method: textField(payload, "method", "REQUEST"),
    severity: httpStatus >= 500 ? "critical" : "warning",
    source: textField(payload, "source", "security-denial-api"),
    correlationId,
    metadata: {
      ...metadataFromPayload(payload),
      claims_role: auth.claimsRole,
      ip: requestIp(request),
      user_agent: request.headers.get("user-agent")
    }
  });

  return NextResponse.json({ status: "recorded", correlationId }, { headers: { "x-correlation-id": correlationId } });
}
