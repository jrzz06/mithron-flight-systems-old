export const LEAD_SOURCES = ["contact_form", "product_enquiry", "checkout_enquiry"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_STATUSES = ["new", "converted"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type AdminLeadRow = {
  id: string;
  lead_number?: number | null;
  name: string;
  phone: string;
  email: string;
  address?: string | null;
  product_slug?: string | null;
  product_name?: string | null;
  message?: string | null;
  source: LeadSource | string;
  status: LeadStatus | string;
  converted_order_id?: string | null;
  customer_user_id?: string | null;
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  order_number?: string | null;
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  contact_form: "Contact",
  product_enquiry: "Product",
  checkout_enquiry: "Checkout"
};

export const LEAD_SOURCE_BADGE_CLASSES: Record<LeadSource, string> = {
  contact_form: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  product_enquiry: "border-violet-500/40 bg-violet-500/10 text-violet-200",
  checkout_enquiry: "border-amber-500/40 bg-amber-500/10 text-amber-200"
};

export function normalizeLeadSource(value: unknown): LeadSource {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "product_enquiry" || raw === "product" || raw === "product_page") return "product_enquiry";
  if (raw === "checkout_enquiry" || raw === "checkout" || raw === "buy_now" || raw === "buy-now") return "checkout_enquiry";
  return "contact_form";
}

export function leadSourceLabel(source: unknown) {
  return LEAD_SOURCE_LABELS[normalizeLeadSource(source)];
}

export function leadSourceBadgeClass(source: unknown) {
  return LEAD_SOURCE_BADGE_CLASSES[normalizeLeadSource(source)];
}

export function formatLeadReference(leadNumber: number | null | undefined) {
  if (!leadNumber || !Number.isFinite(leadNumber)) return "Lead";
  return `LEAD-${String(Math.trunc(leadNumber)).padStart(5, "0")}`;
}

export function isLeadConverted(lead: Pick<AdminLeadRow, "status" | "converted_order_id">) {
  return text(lead.status) === "converted" || Boolean(text(lead.converted_order_id));
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
