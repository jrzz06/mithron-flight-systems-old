import { getSupabaseAdminConfig } from "@/lib/env";

type EnvSource = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

export type SecurityEventInput = {
  actorUserId?: string | null;
  actorRole?: string | null;
  eventType: string;
  attemptedResource: string;
  correlationId?: string | null;
  denialReason?: string | null;
  routePath?: string | null;
  httpStatus?: number | null;
  severity?: "info" | "notice" | "warning" | "critical";
  source?: string;
  dedupeKey?: string | null;
  metadata?: JsonRecord;
};

export type AuthActivityEventInput = {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: "auth.login" | "auth.logout" | "auth.failed_login" | "auth.password_reset" | "auth.invite_accept" | "auth.session_revoked";
  sessionIdentifier?: string | null;
  authProvider?: string | null;
  correlationId?: string | null;
  severity?: "info" | "notice" | "warning" | "critical";
  metadata?: JsonRecord;
};

const correlationHeaderNames = ["x-correlation-id", "x-request-id"];
const securityEventDedupeColumns = "select=id,dedupe_key,event_type,created_at";

function sanitizeCorrelationId(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim().replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 120);
  return normalized || null;
}

export function createSecurityCorrelationId(prefix = "sec") {
  const safePrefix = sanitizeCorrelationId(prefix) ?? "sec";
  const randomPart = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);
  return `${safePrefix}-${Date.now().toString(36)}-${randomPart}`;
}

export function extractSecurityCorrelationId(headers: Headers, fallbackPrefix = "sec") {
  for (const header of correlationHeaderNames) {
    const value = sanitizeCorrelationId(headers.get(header));
    if (value) return value;
  }

  const traceparent = headers.get("traceparent");
  const traceId = sanitizeCorrelationId(traceparent?.split("-")[1]);
  return traceId ?? createSecurityCorrelationId(fallbackPrefix);
}

function metadataCorrelationId(metadata: JsonRecord | undefined) {
  const value = metadata?.correlation_id ?? metadata?.correlationId;
  return typeof value === "string" ? sanitizeCorrelationId(value) : null;
}

function adminHeaders(serviceRoleKey: string, prefer = "return=representation") {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: prefer
  };
}

function getRequestIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? headers.get("x-real-ip")
    ?? null;
}

function getDeviceMetadata(headers: Headers) {
  return {
    ip: getRequestIp(headers),
    user_agent: headers.get("user-agent"),
    referer: headers.get("referer")
  };
}

async function serviceInsert(table: string, payload: JsonRecord, env: EnvSource = process.env) {
  const config = getSupabaseAdminConfig(env);
  if (!config.configured) {
    throw new Error(config.message);
  }

  const response = await fetch(`${config.url}/rest/v1/${table}`, {
    method: "POST",
    headers: adminHeaders(config.serviceRoleKey),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Failed to persist ${table}: ${response.status} ${response.statusText}${detail ? ` - ${detail.slice(0, 400)}` : ""}`);
  }

  const rows = await response.json() as JsonRecord[];
  return rows[0] ?? payload;
}

function isActorForeignKeyFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("violates foreign key constraint")
    && (
      message.includes("actor_user_id")
      || message.includes("actor_id")
      || message.includes("created_by")
    )
  );
}

function isDuplicateDedupeFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("23505") || message.includes("duplicate key value violates unique constraint");
}

function retryWithoutActorForeignKeys(payload: JsonRecord) {
  const metadata = payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
    ? { ...payload.metadata as JsonRecord }
    : {};
  const originalActorUserId = payload.actor_user_id ?? payload.actor_id ?? payload.created_by ?? null;

  return {
    ...payload,
    ...(Object.hasOwn(payload, "actor_user_id") ? { actor_user_id: null } : {}),
    ...(Object.hasOwn(payload, "actor_id") ? { actor_id: null } : {}),
    ...(Object.hasOwn(payload, "created_by") ? { created_by: null } : {}),
    metadata: {
      ...metadata,
      original_actor_user_id: originalActorUserId,
      actor_fk_fallback: true
    }
  };
}

async function serviceInsertWithActorFallback(table: string, payload: JsonRecord, env: EnvSource = process.env) {
  try {
    return await serviceInsert(table, payload, env);
  } catch (error) {
    if (!isActorForeignKeyFailure(error)) throw error;
    return serviceInsert(table, retryWithoutActorForeignKeys(payload), env);
  }
}

async function serviceFindByDedupeKey(table: string, dedupeKey: unknown, env: EnvSource = process.env) {
  const config = getSupabaseAdminConfig(env);
  if (!config.configured) {
    throw new Error(config.message);
  }

  const response = await fetch(
    `${config.url}/rest/v1/${table}?${securityEventDedupeColumns}&dedupe_key=eq.${encodeURIComponent(String(dedupeKey))}&limit=1`,
    { headers: adminHeaders(config.serviceRoleKey, "") }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Failed to read ${table} dedupe record: ${response.status} ${response.statusText}${detail ? ` - ${detail.slice(0, 400)}` : ""}`);
  }

  const rows = await response.json() as JsonRecord[];
  return rows[0] ?? null;
}

type ServiceUpsertResult = {
  row: JsonRecord;
  inserted: boolean;
};

async function serviceUpsertByDedupeKey(table: string, payload: JsonRecord, env: EnvSource = process.env): Promise<ServiceUpsertResult> {
  if (!payload.dedupe_key) {
    const row = await serviceInsertWithActorFallback(table, payload, env);
    return { row, inserted: true };
  }

  try {
    const row = await serviceInsertWithActorFallback(table, payload, env);
    return { row, inserted: true };
  } catch (error) {
    if (isDuplicateDedupeFailure(error)) {
      const existing = await serviceFindByDedupeKey(table, payload.dedupe_key, env);
      return { row: existing ?? payload, inserted: false };
    }
    throw error;
  }
}

function buildSecurityEventDedupeKey(input: Pick<SecurityEventInput, "eventType" | "actorUserId" | "routePath" | "attemptedResource" | "dedupeKey">) {
  if (input.dedupeKey) return input.dedupeKey;
  const resource = input.routePath ?? input.attemptedResource;
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  return [input.eventType, input.actorUserId ?? "anonymous", resource, hourBucket].join(":");
}

export async function recordSecurityEvent(input: SecurityEventInput, env: EnvSource = process.env) {
  const correlationId = sanitizeCorrelationId(input.correlationId) ?? metadataCorrelationId(input.metadata);
  const metadata = {
    ...(input.metadata ?? {}),
    ...(correlationId ? { correlation_id: correlationId } : {})
  };
  const dedupeKey = buildSecurityEventDedupeKey(input);
  const payload = {
    actor_user_id: input.actorUserId ?? null,
    actor_role: input.actorRole ?? null,
    event_type: input.eventType,
    attempted_resource: input.attemptedResource,
    denial_reason: input.denialReason ?? null,
    route_path: input.routePath ?? null,
    http_status: input.httpStatus ?? null,
    severity: input.severity ?? "warning",
    source: input.source ?? "application",
    dedupe_key: dedupeKey,
    metadata
  };

  const { row: securityEvent } = await serviceUpsertByDedupeKey("security_events", payload, env);
  return securityEvent;
}

export async function recordSecurityEventFromMiddleware(request: Request, input: Omit<SecurityEventInput, "metadata"> & { metadata?: JsonRecord }) {
  try {
    await recordSecurityEvent({
      ...input,
      correlationId: input.correlationId ?? extractSecurityCorrelationId(request.headers),
      metadata: {
        ...(input.metadata ?? {}),
        ...getDeviceMetadata(request.headers)
      }
    });
  } catch (error) {
    console.error("[mithron-security] Failed to persist middleware security event.", error);
  }
}

export async function recordObservedRestDenial(input: {
  actorUserId?: string | null;
  actorRole?: string | null;
  attemptedResource: string;
  denialReason?: string | null;
  routePath?: string | null;
  httpStatus?: number | null;
  method?: string | null;
  severity?: "info" | "notice" | "warning" | "critical";
  eventType?: "security.rest_denied" | "security.rls_denied" | "security.denied_mutation" | "security.privilege_escalation" | "security.realtime_denied";
  source?: string;
  correlationId?: string | null;
  metadata?: JsonRecord;
}, env: EnvSource = process.env) {
  return recordSecurityEvent({
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
    eventType: input.eventType ?? "security.rest_denied",
    attemptedResource: input.attemptedResource,
    denialReason: input.denialReason ?? "Denied REST/RLS attempt observed by application telemetry.",
    routePath: input.routePath ?? null,
    httpStatus: input.httpStatus ?? 403,
    severity: input.severity ?? "warning",
    source: input.source ?? "security-denial-wrapper",
    correlationId: input.correlationId ?? metadataCorrelationId(input.metadata),
    dedupeKey: [
      input.eventType ?? "security.rest_denied",
      input.actorUserId ?? "anonymous",
      input.method ?? "REQUEST",
      input.attemptedResource,
      Math.floor(Date.now() / 3_600_000)
    ].join(":"),
    metadata: {
      method: input.method ?? null,
      observed_denial: true,
      ...(input.metadata ?? {})
    }
  }, env);
}

export async function recordAuthActivityEvent(input: AuthActivityEventInput, request?: Request, env: EnvSource = process.env) {
  const correlationId = sanitizeCorrelationId(input.correlationId) ?? (request ? extractSecurityCorrelationId(request.headers, "auth") : metadataCorrelationId(input.metadata));
  const metadata = {
    actor_role: input.actorRole ?? null,
    session_identifier: input.sessionIdentifier ?? null,
    auth_provider: input.authProvider ?? "supabase",
    ...(correlationId ? { correlation_id: correlationId } : {}),
    ...(request ? getDeviceMetadata(request.headers) : {}),
    ...(input.metadata ?? {})
  };

  const activity = await serviceInsertWithActorFallback("activity_logs", {
    actor_id: input.actorUserId ?? null,
    action: input.action,
    entity_table: "auth",
    entity_id: input.actorUserId ?? input.sessionIdentifier ?? input.action,
    severity: input.severity ?? (input.action === "auth.failed_login" ? "warning" : "info"),
    metadata
  }, env);

  await serviceInsertWithActorFallback("audit_logs", {
    actor_id: input.actorUserId ?? null,
    action: input.action,
    entity_table: "auth",
    entity_id: input.actorUserId ?? input.sessionIdentifier ?? input.action,
    before_data: null,
    after_data: {
      action: input.action,
      actor_user_id: input.actorUserId ?? null,
      actor_role: input.actorRole ?? null,
      session_identifier: input.sessionIdentifier ?? null
    },
    metadata: {
      source: "mithron-auth-observability",
      activity_log_id: activity.id ?? null,
      ...metadata
    }
  }, env);

  if (input.action === "auth.failed_login") {
    await recordSecurityEvent({
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      eventType: "security.auth_failed",
      attemptedResource: "auth.login",
      denialReason: String(input.metadata?.error ?? "Failed Supabase Auth login"),
      routePath: "/login",
      httpStatus: 401,
      severity: "warning",
      source: "auth",
      metadata
    }, env);
  }

  return activity;
}
