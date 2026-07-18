/**
 * Compatibility shim: legacy enquiry APIs now backed by the unified `leads` table.
 * New code should import from `@/services/leads` directly.
 */
import { assertSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { formatLeadReference } from "@/lib/leads/shared";
import {
  ADMIN_MUTATION_TIMEOUT_MS,
  createNotificationRecord,
  notificationDedupeKey,
  updateAdminRecord
} from "@/services/admin-actions";
import { listAdminLeads, submitLead, type AdminLeadRow } from "@/services/leads";

type EnvSource = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

export type AdminEnquiryRow = AdminLeadRow & {
  customer_email?: string;
  customer_full_name?: string;
  customer_phone?: string;
  subject?: string;
  body?: string;
  related_product_slug?: string | null;
  enquiry_number?: number | null;
  enquiry_kind?: string | null;
  order_id?: string | null;
  source?: string;
  notes?: unknown[];
  timeline?: unknown[];
  queue_kind?: string;
};

export type EnquiryTimelineEntry = {
  at: string;
  action?: string;
  actor_id?: string | null;
  summary?: string;
  status?: string;
};

export type EnquiryNoteEntry = {
  id: string;
  at: string;
  actor_id: string;
  body: string;
};

export { formatLeadReference as formatEnquiryReference };

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function leadAsEnquiry(lead: AdminLeadRow): AdminEnquiryRow {
  return {
    ...lead,
    customer_email: lead.email,
    customer_full_name: lead.name,
    customer_phone: lead.phone,
    subject: lead.product_name ? `Enquiry: ${lead.product_name}` : "Lead enquiry",
    body: lead.message ?? "",
    related_product_slug: lead.product_slug ?? null,
    enquiry_number: lead.lead_number ?? null,
    enquiry_kind: lead.source === "checkout_enquiry" ? "checkout" : "product",
    order_id: lead.converted_order_id ?? null,
    source: lead.source === "contact_form" ? "contact" : lead.source === "checkout_enquiry" ? "checkout" : "product",
    notes: [],
    timeline: [],
    queue_kind: "enquiry"
  };
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

export async function notifyAdminsAboutPaidOrder(
  input: {
    orderId: string;
    orderNumber: string;
    actorId?: string | null;
  },
  env: EnvSource = process.env
) {
  const { getAdminSettingsPolicy } = await import("@/services/admin-settings-policy");
  const policy = await getAdminSettingsPolicy(env);
  if (!policy.orderAlertsEnabled) return;

  const adminIds = await listAdminRecipientIds("admin", env);
  for (const recipientId of adminIds) {
    await createNotificationRecord(
      {
        recipient_id: recipientId,
        channel: "in_app",
        title: "New paid order",
        body: `Order ${input.orderNumber} was paid and is ready for review.`,
        status: "unread",
        priority: "high",
        entity_table: "orders",
        entity_id: input.orderId,
        dedupe_key: notificationDedupeKey("order-paid", input.orderId, recipientId)
      },
      input.actorId ?? null,
      env
    ).catch(() => undefined);
  }
}

export async function listAdminEnquiries(
  options: { status?: string; q?: string; limit?: number; offset?: number } = {},
  env: EnvSource = process.env
) {
  const leads = await listAdminLeads({
    status: options.status === "lost" || options.status === "closed" ? "converted" : options.status,
    q: options.q,
    limit: options.limit,
    offset: options.offset,
    env
  });
  return leads.map(leadAsEnquiry);
}

export async function listOwnEnquiries(userId: string, env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/leads?select=*&customer_user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=50`,
    { headers: headers(config.serviceRoleKey), cache: "no-store", signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS) }
  );
  if (!response.ok) {
    return { ok: false as const, error: "unavailable", status: response.status };
  }
  const rows = (await response.json()) as AdminLeadRow[];
  return {
    ok: true as const,
    data: rows.map((lead) => ({
      ...leadAsEnquiry(lead),
      timeline: [] as EnquiryTimelineEntry[]
    }))
  };
}

export async function getOwnEnquiryById(userId: string, enquiryId: string, env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/leads?id=eq.${encodeURIComponent(enquiryId)}&customer_user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
    { headers: headers(config.serviceRoleKey), cache: "no-store", signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS) }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as AdminLeadRow[];
  return rows[0] ? leadAsEnquiry(rows[0]) : null;
}

export async function getEnquiryById(enquiryId: string, env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/leads?id=eq.${encodeURIComponent(enquiryId)}&select=*&limit=1`,
    { headers: headers(config.serviceRoleKey), cache: "no-store", signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS) }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as AdminLeadRow[];
  return rows[0] ? leadAsEnquiry(rows[0]) : null;
}

export async function linkGuestEnquiriesToUser(userId: string, email: string, env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { updated: 0 };
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/leads?email=eq.${encodeURIComponent(normalized)}&customer_user_id=is.null`,
    {
      method: "PATCH",
      headers: { ...headers(config.serviceRoleKey), Prefer: "return=representation" },
      signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS),
      body: JSON.stringify({ customer_user_id: userId, updated_at: new Date().toISOString() })
    }
  );
  if (!response.ok) return { updated: 0 };
  const rows = (await response.json()) as JsonRecord[];
  return { updated: rows.length };
}

export async function submitProductPageEnquiry(
  input: {
    customerUserId?: string | null;
    customerEmail: string;
    customerPhone: string;
    customerFullName: string;
    customerCompany?: string | null;
    subject?: string;
    body?: string;
    relatedProductSlug?: string | null;
    region?: string | null;
    productName?: string | null;
    productSku?: string | null;
    preferredContactMethod?: string | null;
    quantity?: number | null;
    shippingAddress?: { line1?: string; city?: string; region?: string; postalCode?: string } | null;
  },
  actorId: string | null = null,
  env: EnvSource = process.env
) {
  const address = input.shippingAddress
    ? [input.shippingAddress.line1, input.shippingAddress.city, input.shippingAddress.region, input.shippingAddress.postalCode]
        .filter(Boolean)
        .join(", ")
    : null;
  const lead = await submitLead(
    {
      customerUserId: input.customerUserId,
      email: input.customerEmail,
      phone: input.customerPhone,
      name: input.customerFullName,
      address,
      productSlug: input.relatedProductSlug,
      productName: input.productName,
      message: input.body || input.subject || "",
      source: "product_enquiry",
      payload: {
        company: input.customerCompany ?? null,
        region: input.region ?? null,
        product_sku: input.productSku ?? null,
        preferred_contact_method: input.preferredContactMethod ?? null,
        quantity: input.quantity ?? null
      }
    },
    actorId,
    env
  );
  return leadAsEnquiry(lead);
}

export async function submitCheckoutProductEnquiry(
  input: {
    customerUserId?: string | null;
    customerEmail: string;
    customerPhone: string;
    customerFullName: string;
    customerCompany?: string | null;
    enquiryMessage: string;
    region?: string | null;
    relatedProductSlug?: string | null;
    cartLines: Array<{ product_slug: string; product_name: string; quantity: number; sku?: string | null }>;
    guestAddress?: { line1?: string; city?: string; region?: string; postalCode?: string } | null;
    idempotencyKey?: string | null;
  },
  actorId: string | null = null,
  env: EnvSource = process.env
) {
  const primary = input.cartLines[0];
  const address = input.guestAddress
    ? [input.guestAddress.line1, input.guestAddress.city, input.guestAddress.region, input.guestAddress.postalCode]
        .filter(Boolean)
        .join(", ")
    : null;
  const lead = await submitLead(
    {
      customerUserId: input.customerUserId,
      email: input.customerEmail,
      phone: input.customerPhone,
      name: input.customerFullName,
      address,
      productSlug: primary?.product_slug ?? input.relatedProductSlug,
      productName: primary?.product_name ?? null,
      message: input.enquiryMessage,
      source: "checkout_enquiry",
      idempotencyKey: input.idempotencyKey,
      payload: {
        company: input.customerCompany ?? null,
        region: input.region ?? null,
        cart_lines: input.cartLines
      }
    },
    actorId,
    env
  );
  return leadAsEnquiry(lead);
}

export async function findCheckoutEnquiryByIdempotencyKey(
  idempotencyKey: string,
  _scope?: { userId?: string; guestEmail?: string; guestPhone?: string },
  env: EnvSource = process.env
) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/leads?select=*&payload->>idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`,
    { headers: headers(config.serviceRoleKey), cache: "no-store", signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS) }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as AdminLeadRow[];
  return rows[0] ? leadAsEnquiry(rows[0]) : null;
}

export async function promoteEnquiryToOrder() {
  throw new Error("Use pushLeadToOrder via /admin/leads instead.");
}

export async function markEnquiryContacted() {
  throw new Error("Lead workflow no longer tracks contacted status. Push to order or delete.");
}

export async function archiveEnquiry() {
  throw new Error("Archive removed. Delete leads from /admin/leads.");
}

export async function updateAdminRecordLeadConverted(
  leadId: string,
  orderId: string,
  actorId: string,
  env: EnvSource = process.env
) {
  return updateAdminRecord(
    "leads",
    "id",
    leadId,
    {
      status: "converted",
      converted_order_id: orderId,
      updated_at: new Date().toISOString()
    },
    actorId,
    env
  );
}
