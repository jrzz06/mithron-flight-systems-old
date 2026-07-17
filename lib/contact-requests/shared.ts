export type ContactRequestTimelineEntry = {
  at: string;
  action: string;
  actor_id: string | null;
  summary: string;
  status?: string;
};

export type ContactRequestNoteEntry = {
  id: string;
  at: string;
  actor_id: string;
  body: string;
};

/** Lead origin stored in contact_requests.payload.source */
export type ContactRequestLeadSource = "contact" | "product_enquiry" | "buy_now" | "checkout";

/** Simplified admin-facing lead status */
export type ContactRequestLeadStatus = "new" | "contacted" | "converted" | "closed";

export type ContactRequestAddressView = {
  line1: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};

export type ContactRequestAddressFieldKey = keyof ContactRequestAddressView;

export type ContactRequestAddressFieldDef = {
  key: ContactRequestAddressFieldKey;
  label: string;
  formName: string;
};

export const CONTACT_REQUEST_ADDRESS_FIELDS: ContactRequestAddressFieldDef[] = [
  { key: "line1", label: "Street address", formName: "line1" },
  { key: "city", label: "City", formName: "city" },
  { key: "state", label: "State / province", formName: "state" },
  { key: "postalCode", label: "Postal code", formName: "postal_code" },
  { key: "country", label: "Country", formName: "country" }
];

export type AdminContactRequestRow = {
  id: string;
  request_number: number | null;
  customer_user_id?: string | null;
  customer_email: string;
  customer_full_name?: string;
  customer_company?: string;
  customer_phone?: string;
  subject: string;
  body: string;
  status: string;
  source: ContactRequestLeadSource;
  product_name?: string | null;
  related_product_slug?: string | null;
  region?: string | null;
  assigned_to?: string | null;
  converted_order_id?: string | null;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
  deleted_at?: string | null;
  payload?: Record<string, unknown>;
  timeline: ContactRequestTimelineEntry[];
  notes: ContactRequestNoteEntry[];
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readPayload(row: AdminContactRequestRow) {
  return row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
    ? row.payload
    : {};
}

function readAddressPayload(value: unknown, countryFallback = ""): ContactRequestAddressView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const line1 = text(record.line1);
  const city = text(record.city);
  const state = text(record.state) || text(record.region);
  const country = text(record.country) || text(countryFallback);
  const postalCode = text(record.postal_code) || text(record.postalCode);
  if (!line1 && !city && !state && !country && !postalCode) return null;
  return { line1, city, state, country, postalCode };
}

export function shippingFormFieldName(fieldKey: ContactRequestAddressFieldKey) {
  const def = CONTACT_REQUEST_ADDRESS_FIELDS.find((field) => field.key === fieldKey);
  return def ? `shipping_${def.formName}` : `shipping_${fieldKey}`;
}

export function billingFormFieldName(fieldKey: ContactRequestAddressFieldKey) {
  const def = CONTACT_REQUEST_ADDRESS_FIELDS.find((field) => field.key === fieldKey);
  return def ? `billing_${def.formName}` : `billing_${fieldKey}`;
}

export function isCompleteContactRequestAddress(address: ContactRequestAddressView | null | undefined) {
  if (!address) return false;
  return CONTACT_REQUEST_ADDRESS_FIELDS.every((field) => Boolean(address[field.key]?.trim()));
}

export function getMissingContactRequestAddressFields(
  address: ContactRequestAddressView | null | undefined
): ContactRequestAddressFieldKey[] {
  if (!address) return CONTACT_REQUEST_ADDRESS_FIELDS.map((field) => field.key);
  return CONTACT_REQUEST_ADDRESS_FIELDS
    .filter((field) => !address[field.key]?.trim())
    .map((field) => field.key);
}

export function formatMissingContactRequestAddressLabels(keys: ContactRequestAddressFieldKey[]) {
  return keys
    .map((key) => CONTACT_REQUEST_ADDRESS_FIELDS.find((field) => field.key === key)?.label ?? key)
    .join(", ");
}

export function contactRequestShippingAddress(request: AdminContactRequestRow) {
  const payload = readPayload(request);
  const countryFallback = text(request.region) || text(payload.region);
  return readAddressPayload(payload.shipping_address, countryFallback)
    ?? readAddressPayload(payload.guest_shipping_address, countryFallback);
}

export function contactRequestBillingAddress(request: AdminContactRequestRow) {
  const payload = readPayload(request);
  const countryFallback = text(request.region) || text(payload.region);
  return readAddressPayload(payload.billing_address, countryFallback);
}

export function contactRequestBillingSameAsShipping(request: AdminContactRequestRow) {
  const payload = readPayload(request);
  return payload.billing_same_as_shipping === true;
}

export function contactRequestHasShippingAddress(request: AdminContactRequestRow) {
  const payload = readPayload(request);
  if (text(payload.shipping_address_id)) return true;
  const countryFallback = text(request.region) || text(payload.region);
  const shipping = readAddressPayload(payload.shipping_address, countryFallback);
  if (shipping && isCompleteContactRequestAddress(shipping)) return true;
  const guestShipping = readAddressPayload(payload.guest_shipping_address, countryFallback);
  if (guestShipping && isCompleteContactRequestAddress(guestShipping)) return true;
  return false;
}

export function contactRequestMissingShippingAddressFields(request: AdminContactRequestRow): ContactRequestAddressFieldKey[] {
  const payload = readPayload(request);
  if (text(payload.shipping_address_id)) return [];
  const saved = contactRequestShippingAddress(request);
  if (!saved) return CONTACT_REQUEST_ADDRESS_FIELDS.map((field) => field.key);
  return getMissingContactRequestAddressFields(saved);
}

export function contactRequestMissingShippingAddressSummary(request: AdminContactRequestRow) {
  const missing = contactRequestMissingShippingAddressFields(request);
  if (!missing.length) return null;
  return formatMissingContactRequestAddressLabels(missing);
}

export function formatContactRequestAddress(address: ContactRequestAddressView | null | undefined) {
  if (!address) return "—";
  return [
    address.line1,
    [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    address.country
  ]
    .filter(Boolean)
    .join("\n") || "—";
}

export function formatContactRequestReference(requestNumber: number | string | null | undefined) {
  const parsed = typeof requestNumber === "number" ? requestNumber : Number(requestNumber);
  if (!Number.isFinite(parsed) || parsed <= 0) return "Request";
  return `Request #${parsed}`;
}

export function normalizeContactRequestLeadSource(value: unknown): ContactRequestLeadSource {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "product_enquiry" || raw === "product_page") return "product_enquiry";
  if (raw === "buy_now" || raw === "buy-now") return "buy_now";
  if (raw === "checkout") return "checkout";
  return "contact";
}

export function contactRequestSourceLabel(source: ContactRequestLeadSource | string | null | undefined) {
  const normalized = normalizeContactRequestLeadSource(source);
  if (normalized === "product_enquiry") return "Product Enquiry";
  if (normalized === "buy_now") return "Buy Now";
  if (normalized === "checkout") return "Checkout";
  return "Contact";
}

export function contactRequestLeadStatus(status: string | null | undefined): ContactRequestLeadStatus {
  const value = (status ?? "new").trim().toLowerCase();
  if (value === "new") return "new";
  if (value === "contacted" || value === "qualified") return "contacted";
  if (value === "converted") return "converted";
  return "closed";
}

export function contactRequestLeadStatusLabel(status: string | null | undefined) {
  const lead = contactRequestLeadStatus(status);
  if (lead === "new") return "New";
  if (lead === "contacted") return "Contacted";
  if (lead === "converted") return "Converted";
  return "Closed";
}

export function contactRequestMatchesLeadStatusFilter(
  status: string | null | undefined,
  filter: string
) {
  if (!filter || filter === "all") return true;
  return contactRequestLeadStatus(status) === filter;
}

