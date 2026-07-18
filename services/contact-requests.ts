/**
 * Compatibility shim: contact request APIs now backed by the unified `leads` table.
 */
import {
  formatLeadReference,
  normalizeLeadSource,
  type AdminLeadRow,
  type LeadSource
} from "@/lib/leads/shared";
import { deleteLead, listAdminLeads, pushLeadToOrder, submitLead } from "@/services/leads";

export type ContactRequestLeadSource = LeadSource | "buy_now" | "checkout" | "product_enquiry" | "contact";
export type AdminContactRequestRow = AdminLeadRow & {
  request_number?: number | null;
  customer_email?: string;
  customer_phone?: string;
  customer_full_name?: string;
  customer_company?: string | null;
  subject?: string;
  body?: string;
};

export type ContactRequestNoteEntry = {
  id: string;
  at: string;
  actor_id: string;
  body: string;
};

export type ContactRequestTimelineEntry = {
  at: string;
  action: string;
  actor_id: string | null;
  summary: string;
  status?: string;
};

export {
  formatLeadReference as formatContactRequestReference,
  normalizeLeadSource as normalizeContactRequestLeadSource
};

export function contactRequestLeadStatus(status: unknown) {
  const value = typeof status === "string" ? status : "new";
  if (value === "converted") return "converted";
  if (value === "rejected" || value === "archived" || value === "closed" || value === "lost") return "closed";
  if (value === "contacted" || value === "qualified") return "contacted";
  return "new";
}

export function contactRequestLeadStatusLabel(status: unknown) {
  const normalized = contactRequestLeadStatus(status);
  if (normalized === "converted") return "Converted";
  if (normalized === "closed") return "Closed";
  if (normalized === "contacted") return "Contacted";
  return "New";
}

export function contactRequestMatchesLeadStatusFilter(status: unknown, filter: string) {
  if (!filter || filter === "all") return true;
  return contactRequestLeadStatus(status) === filter;
}

export function contactRequestSourceLabel(source: unknown) {
  const normalized = normalizeLeadSource(source);
  if (normalized === "product_enquiry") return "Product";
  if (normalized === "checkout_enquiry") return "Checkout";
  return "Contact";
}

function leadAsContactRequest(lead: AdminLeadRow): AdminContactRequestRow {
  return {
    ...lead,
    request_number: lead.lead_number ?? null,
    customer_email: lead.email,
    customer_phone: lead.phone,
    customer_full_name: lead.name,
    subject: lead.product_name ? `Lead: ${lead.product_name}` : "Contact request",
    body: lead.message ?? ""
  };
}

export async function submitContactRequest(
  input: {
    customerUserId?: string | null;
    customerEmail: string;
    customerPhone: string;
    customerFullName: string;
    customerCompany?: string | null;
    subject: string;
    body: string;
    region?: string | null;
    source?: ContactRequestLeadSource;
    productName?: string | null;
    relatedProductSlug?: string | null;
    idempotencyKey?: string | null;
  },
  actorId: string | null = null,
  env: Record<string, string | undefined> = process.env
) {
  const lead = await submitLead(
    {
      customerUserId: input.customerUserId,
      email: input.customerEmail,
      phone: input.customerPhone,
      name: input.customerFullName,
      productSlug: input.relatedProductSlug,
      productName: input.productName,
      message: [input.subject, input.body].filter(Boolean).join("\n\n"),
      source: normalizeLeadSource(input.source),
      idempotencyKey: input.idempotencyKey,
      payload: {
        company: input.customerCompany ?? null,
        region: input.region ?? null,
        subject: input.subject
      }
    },
    actorId,
    env
  );
  return leadAsContactRequest(lead);
}

export async function listAdminContactRequests(
  options: {
    status?: string;
    q?: string;
    limit?: number;
    offset?: number;
    env?: Record<string, string | undefined>;
  } = {}
) {
  const leads = await listAdminLeads({
    status: options.status === "closed" || options.status === "rejected" ? "converted" : options.status,
    q: options.q,
    limit: options.limit,
    offset: options.offset,
    env: options.env
  });
  return leads.map(leadAsContactRequest);
}

export async function promoteContactRequestToOrder(
  contactRequestId: string,
  actorId: string,
  env: Record<string, string | undefined> = process.env
) {
  return pushLeadToOrder(contactRequestId, actorId, {}, env);
}

export async function rejectContactRequest(
  contactRequestId: string,
  actorId: string,
  _note?: string,
  env: Record<string, string | undefined> = process.env
) {
  return deleteLead(contactRequestId, actorId, env);
}

export async function archiveContactRequest(
  contactRequestId: string,
  actorId: string,
  _note?: string,
  env: Record<string, string | undefined> = process.env
) {
  return deleteLead(contactRequestId, actorId, env);
}

export async function markContactRequestContacted() {
  throw new Error("Lead workflow no longer tracks contacted status. Push to order or delete.");
}

export async function markContactRequestInProgress() {
  throw new Error("Lead workflow no longer tracks in-progress status. Push to order or delete.");
}
