type JsonRecord = Record<string, unknown>;

export type EnquiryTimelineEntry = {
  at: string;
  action: string;
  actor_id: string | null;
  summary: string;
  status?: string;
};

export type EnquiryNoteEntry = {
  id: string;
  at: string;
  actor_id: string;
  body: string;
};

export type EnquiryCartLine = {
  product_slug: string;
  product_name: string;
  quantity: number;
  sku?: string | null;
};

export type AdminEnquiryRow = JsonRecord & {
  id: string;
  enquiry_number?: number | null;
  customer_email: string;
  customer_full_name?: string;
  customer_company?: string;
  customer_phone?: string;
  subject: string;
  body: string;
  status: string;
  source: "contact" | "checkout" | "product_page";
  queue_kind: "enquiry" | "checkout_order";
  order_number?: string;
  order_id?: string | null;
  related_product_slug?: string | null;
  cart_lines?: EnquiryCartLine[];
  enquiry_message?: string;
  priority?: string;
  assigned_staff?: string;
  follow_up_date?: string;
  timeline?: EnquiryTimelineEntry[];
  notes?: EnquiryNoteEntry[];
  created_at?: string;
  updated_at?: string;
};

export function formatEnquiryReference(enquiryNumber: number | string | null | undefined) {
  const parsed = typeof enquiryNumber === "number" ? enquiryNumber : Number(enquiryNumber);
  if (!Number.isFinite(parsed) || parsed <= 0) return "Enquiry";
  return `Enquiry #${parsed}`;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function readEnquiryPayload(payload: unknown): JsonRecord {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as JsonRecord
    : {};
}

export function enquiryPayloadString(payload: JsonRecord, key: string) {
  return text(payload[key]);
}

export function enquiryCustomerName(enquiry: AdminEnquiryRow) {
  return text(enquiry.customer_full_name)
    || enquiryPayloadString(readEnquiryPayload(enquiry.payload), "customer_full_name")
    || text(enquiry.customer_email, "Customer");
}

export function enquiryCustomerPhone(enquiry: AdminEnquiryRow) {
  return text(enquiry.customer_phone)
    || enquiryPayloadString(readEnquiryPayload(enquiry.payload), "customer_phone");
}

export function enquiryCustomerCompany(enquiry: AdminEnquiryRow) {
  return text(enquiry.customer_company)
    || enquiryPayloadString(readEnquiryPayload(enquiry.payload), "customer_company");
}

export function enquiryCartLines(enquiry: AdminEnquiryRow): EnquiryCartLine[] {
  if (Array.isArray(enquiry.cart_lines) && enquiry.cart_lines.length) {
    return enquiry.cart_lines;
  }
  const payload = readEnquiryPayload(enquiry.payload);
  const raw = payload.cart_lines;
  if (!Array.isArray(raw)) {
    const summary = text(payload.item_summary);
    if (!summary) return [];
    return summary.split(",").map((part) => {
      const match = part.trim().match(/^(.*)\s+x\s+(\d+)$/i);
      if (!match) return null;
      return {
        product_slug: "",
        product_name: match[1].trim(),
        quantity: Number(match[2]) || 1
      };
    }).filter((line): line is EnquiryCartLine => Boolean(line));
  }
  return raw
    .filter((line) => line && typeof line === "object" && !Array.isArray(line))
    .map((line) => {
      const record = line as JsonRecord;
      return {
        product_slug: text(record.product_slug),
        product_name: text(record.product_name, text(record.product_slug, "Item")),
        quantity: Number(record.quantity ?? 1) || 1,
        sku: text(record.sku) || null
      };
    })
    .filter((line) => line.product_name || line.product_slug);
}

export function enquiryMessageText(enquiry: AdminEnquiryRow) {
  const fromField = text(enquiry.enquiry_message);
  if (fromField) return fromField;
  const payload = readEnquiryPayload(enquiry.payload);
  const fromPayload = text(payload.enquiry_message);
  if (fromPayload) return fromPayload;
  const body = text(enquiry.body);
  const cartMarker = "\n\nCart:";
  const markerIndex = body.indexOf(cartMarker);
  if (markerIndex >= 0) return body.slice(0, markerIndex).trim();
  return body;
}

export function enquiryProductSku(enquiry: AdminEnquiryRow) {
  const lines = enquiryCartLines(enquiry);
  if (lines[0]?.sku) return lines[0].sku;
  const payload = readEnquiryPayload(enquiry.payload);
  return enquiryPayloadString(payload, "product_sku") || enquiryPayloadString(payload, "sku");
}

export function enquiryPreferredContactMethod(enquiry: AdminEnquiryRow) {
  const payload = readEnquiryPayload(enquiry.payload);
  const method = enquiryPayloadString(payload, "preferred_contact_method");
  if (method === "whatsapp") return "WhatsApp";
  if (method === "phone") return "Phone";
  if (method === "email") return "Email";
  return method || "—";
}

export function enquiryRegion(enquiry: AdminEnquiryRow) {
  const payload = readEnquiryPayload(enquiry.payload);
  const shipping = payload.shipping_address;
  if (shipping && typeof shipping === "object" && !Array.isArray(shipping)) {
    const country = text((shipping as JsonRecord).country);
    if (country) return country;
  }
  return text(enquiry.region) || enquiryPayloadString(payload, "region");
}

export function enquiryProductUrl(enquiry: AdminEnquiryRow) {
  return enquiryPayloadString(readEnquiryPayload(enquiry.payload), "product_url");
}

export function enquiryProductId(enquiry: AdminEnquiryRow) {
  const payload = readEnquiryPayload(enquiry.payload);
  return enquiryPayloadString(payload, "product_id")
    || text(enquiry.related_product_slug)
    || enquiryPayloadString(payload, "related_product_slug");
}

export type EnquiryAddressView = {
  line1: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};

export type EnquiryAddressFieldKey = keyof EnquiryAddressView;

export type EnquiryAddressFieldDef = {
  key: EnquiryAddressFieldKey;
  label: string;
  formName: string;
};

export const ENQUIRY_ADDRESS_FIELDS: EnquiryAddressFieldDef[] = [
  { key: "line1", label: "Street address", formName: "line1" },
  { key: "city", label: "City", formName: "city" },
  { key: "state", label: "State / province", formName: "state" },
  { key: "postalCode", label: "Postal code", formName: "postal_code" },
  { key: "country", label: "Country", formName: "country" }
];

export function shippingFormFieldName(fieldKey: EnquiryAddressFieldKey) {
  const def = ENQUIRY_ADDRESS_FIELDS.find((field) => field.key === fieldKey);
  return def ? `shipping_${def.formName}` : `shipping_${fieldKey}`;
}

export function billingFormFieldName(fieldKey: EnquiryAddressFieldKey) {
  const def = ENQUIRY_ADDRESS_FIELDS.find((field) => field.key === fieldKey);
  return def ? `billing_${def.formName}` : `billing_${fieldKey}`;
}

export function isCompleteEnquiryAddress(address: EnquiryAddressView | null | undefined) {
  if (!address) return false;
  return ENQUIRY_ADDRESS_FIELDS.every((field) => Boolean(address[field.key]?.trim()));
}

export function getMissingEnquiryAddressFields(address: EnquiryAddressView | null | undefined): EnquiryAddressFieldKey[] {
  if (!address) return ENQUIRY_ADDRESS_FIELDS.map((field) => field.key);
  return ENQUIRY_ADDRESS_FIELDS
    .filter((field) => !address[field.key]?.trim())
    .map((field) => field.key);
}

export function formatMissingEnquiryAddressLabels(keys: EnquiryAddressFieldKey[]) {
  return keys
    .map((key) => ENQUIRY_ADDRESS_FIELDS.find((field) => field.key === key)?.label ?? key)
    .join(", ");
}

export function enquiryMissingShippingAddressFields(enquiry: AdminEnquiryRow): EnquiryAddressFieldKey[] {
  const saved = enquiryShippingAddress(enquiry);
  if (!saved) return ENQUIRY_ADDRESS_FIELDS.map((field) => field.key);
  return getMissingEnquiryAddressFields(saved);
}

export function enquiryMissingShippingAddressSummary(enquiry: AdminEnquiryRow) {
  const missing = enquiryMissingShippingAddressFields(enquiry);
  if (!missing.length) return null;
  return formatMissingEnquiryAddressLabels(missing);
}

function enquiryCountryFallback(enquiry: AdminEnquiryRow) {
  const payload = readEnquiryPayload(enquiry.payload);
  return text(enquiry.region) || enquiryPayloadString(payload, "region");
}

function readAddressPayload(value: unknown, countryFallback = ""): EnquiryAddressView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as JsonRecord;
  const line1 = text(record.line1);
  const city = text(record.city);
  const state = text(record.state) || text(record.region);
  const country = text(record.country) || text(countryFallback);
  const postalCode = text(record.postal_code) || text(record.postalCode);
  if (!line1 && !city && !state && !country && !postalCode) return null;
  return { line1, city, state, country, postalCode };
}

export function isCompleteStoredEnquiryAddressPayload(value: unknown, countryFallback = "") {
  const address = readAddressPayload(value, countryFallback);
  return isCompleteEnquiryAddress(address);
}

export function enquiryShippingAddress(enquiry: AdminEnquiryRow) {
  const payload = readEnquiryPayload(enquiry.payload);
  const countryFallback = enquiryCountryFallback(enquiry);
  return readAddressPayload(payload.shipping_address, countryFallback)
    ?? readAddressPayload(payload.guest_shipping_address, countryFallback);
}

export function enquiryBillingAddress(enquiry: AdminEnquiryRow) {
  const countryFallback = enquiryCountryFallback(enquiry);
  return readAddressPayload(readEnquiryPayload(enquiry.payload).billing_address, countryFallback);
}

export function enquiryBillingSameAsShipping(enquiry: AdminEnquiryRow) {
  const payload = readEnquiryPayload(enquiry.payload);
  return payload.billing_same_as_shipping === true;
}

export function enquiryHasShippingAddress(enquiry: AdminEnquiryRow) {
  const countryFallback = enquiryCountryFallback(enquiry);
  const payload = readEnquiryPayload(enquiry.payload);
  const shipping = readAddressPayload(payload.shipping_address, countryFallback);
  if (shipping && isCompleteEnquiryAddress(shipping)) return true;
  const guestShipping = readAddressPayload(payload.guest_shipping_address, countryFallback);
  if (guestShipping && isCompleteEnquiryAddress(guestShipping)) return true;
  return false;
}

export function formatEnquiryAddress(address: EnquiryAddressView | null | undefined) {
  if (!address) return "—";
  return [
    address.line1,
    [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    address.country
  ]
    .filter(Boolean)
    .join("\n") || "—";
}

export function enquirySourceLabel(enquiry: AdminEnquiryRow) {
  const source = text(enquiry.source);
  if (source === "checkout") return "Checkout";
  if (source === "product_page") return "Product page";
  return "Contact form";
}

export function enquiryProductLabel(enquiry: AdminEnquiryRow) {
  const lines = enquiryCartLines(enquiry);
  if (lines.length === 1) {
    return `${lines[0].product_name} × ${lines[0].quantity}`;
  }
  if (lines.length > 1) {
    return `${lines[0].product_name} + ${lines.length - 1} more`;
  }
  const payloadName = enquiryPayloadString(readEnquiryPayload(enquiry.payload), "product_name");
  if (payloadName) return payloadName;
  return text(enquiry.related_product_slug) || text(enquiry.subject, "General enquiry");
}

export function formatEnquiryDateTime(value: unknown) {
  const raw = text(value);
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 16);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
