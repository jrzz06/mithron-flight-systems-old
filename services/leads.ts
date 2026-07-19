import { assertSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import {
  type AdminLeadRow,
  type LeadSource,
  formatLeadReference,
  normalizeLeadSource,
  LEADS_REST_SELECT
} from "@/lib/leads/shared";
import {
  ADMIN_MUTATION_TIMEOUT_MS,
  createActivityLogRecord,
  createAdminRecord,
  createNotificationRecord,
  deleteAdminRecord,
  fetchAdminRecordsByColumn,
  updateAdminRecord
} from "@/services/admin-actions";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";

export type { AdminLeadRow, LeadSource } from "@/lib/leads/shared";
export {
  formatLeadReference,
  leadSourceBadgeClass,
  leadSourceLabel,
  normalizeLeadSource,
  isLeadConverted
} from "@/lib/leads/shared";

export type LeadInput = {
  customerUserId?: string | null;
  name: string;
  phone: string;
  email: string;
  address?: string | null;
  productSlug?: string | null;
  productName?: string | null;
  message?: string | null;
  source: LeadSource;
  idempotencyKey?: string | null;
  payload?: Record<string, unknown> | null;
};

type EnvSource = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

function headers(serviceRoleKey: string, prefer = "return=representation") {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: prefer
  };
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isPlainRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function listAdminRecipientIds(roleKey: string, env: EnvSource) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/user_roles?select=user_id&role_key=eq.${encodeURIComponent(roleKey)}&limit=40`,
    { headers: headers(config.serviceRoleKey), cache: "no-store", signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS) }
  );
  if (!response.ok) return [];
  const rows = (await response.json()) as Array<{ user_id?: string }>;
  return rows.map((row) => text(row.user_id)).filter(Boolean);
}

async function notifyAdminsAboutLead(
  input: { leadId: string; title: string; body: string; actorId: string | null },
  env: EnvSource = process.env
) {
  const policy = await getAdminSettingsPolicy(env);
  if (!policy.orderAlertsEnabled) return;

  const adminIds = await listAdminRecipientIds("admin", env);
  await Promise.all(
    adminIds.map((recipientId) =>
      createNotificationRecord(
        {
          recipient_id: recipientId,
          channel: "in_app",
          title: input.title,
          body: input.body,
          status: "unread",
          priority: "high",
          entity_table: "leads",
          entity_id: input.leadId
        },
        input.actorId,
        env,
        input.actorId ? {} : { allowSystemActor: true }
      ).catch(() => undefined)
    )
  );
}

async function findLeadByIdempotencyKey(idempotencyKey: string, env: EnvSource) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/leads?select=${LEADS_REST_SELECT}&payload->>idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`,
    {
      headers: headers(config.serviceRoleKey),
      cache: "no-store",
      signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS)
    }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as AdminLeadRow[];
  return rows[0] ?? null;
}

export async function submitLead(
  input: LeadInput,
  actorId: string | null = null,
  env: EnvSource = process.env
) {
  const email = text(input.email).toLowerCase();
  const name = text(input.name);
  const phone = text(input.phone);
  if (!email || !name || !phone) {
    throw new Error("Name, phone, and email are required.");
  }

  const source = normalizeLeadSource(input.source);
  const idempotencyKey = text(input.idempotencyKey) || null;
  if (idempotencyKey) {
    const existing = await findLeadByIdempotencyKey(idempotencyKey, env);
    if (existing) return existing;
  }

  const payload: JsonRecord = {
    ...(isPlainRecord(input.payload) ? input.payload : {}),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {})
  };

  const record = await createAdminRecord(
    "leads",
    {
      name,
      phone,
      email,
      address: text(input.address) || null,
      product_slug: text(input.productSlug) || null,
      product_name: text(input.productName) || null,
      message: text(input.message) || "",
      source,
      status: "new",
      customer_user_id: text(input.customerUserId) || null,
      payload,
      updated_at: new Date().toISOString()
    },
    actorId,
    env,
    { allowSystemActor: true, allowGuest: true }
  );

  const leadId = text(record.id);
  if (leadId) {
    await notifyAdminsAboutLead(
      {
        leadId,
        title: "New lead received",
        body: `${name} · ${source.replaceAll("_", " ")}`,
        actorId
      },
      env
    ).catch(() => undefined);
  }

  return record as AdminLeadRow;
}

export async function listAdminLeads(
  options: {
    status?: string;
    q?: string;
    source?: string;
    limit?: number;
    offset?: number;
    env?: EnvSource;
  } = {}
) {
  const env = options.env ?? process.env;
  const config = assertSupabaseAdminConfig(env);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const filters: string[] = [
    `select=${LEADS_REST_SELECT}`,
    "order=created_at.desc",
    `limit=${limit}`,
    `offset=${offset}`
  ];

  const status = text(options.status);
  if (status && status !== "all") {
    filters.push(`status=eq.${encodeURIComponent(status)}`);
  }

  const source = text(options.source);
  if (source && source !== "all") {
    filters.push(`source=eq.${encodeURIComponent(normalizeLeadSource(source))}`);
  }

  const q = text(options.q).toLowerCase();
  if (q) {
    const encoded = encodeURIComponent(`%${q}%`);
    filters.push(`or=(name.ilike.${encoded},email.ilike.${encoded},phone.ilike.${encoded},product_name.ilike.${encoded})`);
  }

  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/leads?${filters.join("&")}`,
    {
      headers: headers(config.serviceRoleKey),
      cache: "no-store",
      signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS)
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to list leads: ${response.status}`);
  }

  return (await response.json()) as AdminLeadRow[];
}

export async function pushLeadToOrder(
  leadId: string,
  actorId: string,
  overrides: {
    address?: string | null;
    productSlug?: string | null;
    productName?: string | null;
  } = {},
  env: EnvSource = process.env
) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/rpc/convert_lead_to_order`,
    {
      method: "POST",
      headers: headers(config.serviceRoleKey),
      signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS),
      body: JSON.stringify({
        p_lead_id: leadId,
        p_actor_id: actorId,
        p_address: text(overrides.address) || null,
        p_product_slug: text(overrides.productSlug) || null,
        p_product_name: text(overrides.productName) || null
      })
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Failed to convert lead to order (${response.status}).`);
  }

  const result = (await response.json()) as JsonRecord;
  if (result.ok === false) {
    throw new Error(text(result.error, "Could not convert lead to order."));
  }

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "lead.converted",
      entity_table: "leads",
      entity_id: leadId,
      payload: {
        order_id: result.order_id,
        order_number: result.order_number
      }
    },
    actorId,
    env
  ).catch(() => undefined);

  return result;
}

export async function deleteLead(leadId: string, actorId: string, env: EnvSource = process.env) {
  const rows = await fetchAdminRecordsByColumn("leads", "id", leadId, env);
  const lead = rows[0] as AdminLeadRow | undefined;
  if (!lead) throw new Error("Lead not found.");
  if (text(lead.status) === "converted" || text(lead.converted_order_id)) {
    throw new Error("Converted leads cannot be deleted. Manage the linked order instead.");
  }

  await deleteAdminRecord("leads", "id", leadId, actorId, env);
  return { ok: true as const, id: leadId, reference: formatLeadReference(lead.lead_number) };
}

export async function updateLeadDetails(
  leadId: string,
  actorId: string,
  patch: {
    address?: string | null;
    productSlug?: string | null;
    productName?: string | null;
  },
  env: EnvSource = process.env
) {
  return updateAdminRecord(
    "leads",
    "id",
    leadId,
    {
      ...(patch.address !== undefined ? { address: text(patch.address) || null } : {}),
      ...(patch.productSlug !== undefined ? { product_slug: text(patch.productSlug) || null } : {}),
      ...(patch.productName !== undefined ? { product_name: text(patch.productName) || null } : {}),
      updated_at: new Date().toISOString()
    },
    actorId,
    env
  );
}
