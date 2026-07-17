import { isValidCustomerEmail, isValidCustomerPhone } from "@/lib/api/customer-contact";

export const PRODUCT_ENQUIRY_CONTACT_METHODS = ["email", "phone", "whatsapp"] as const;
export type ProductEnquiryContactMethod = (typeof PRODUCT_ENQUIRY_CONTACT_METHODS)[number];

export type ProductEnquiryAddress = {
  line1: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};

export type ProductEnquiryRequestBody = {
  fullName: string;
  email: string;
  phone: string;
  /** Country - stored on enquiries.region for backward compatibility */
  region: string;
  productSlug: string;
  productName: string;
  productSku: string;
  preferredContactMethod: ProductEnquiryContactMethod;
  message?: string | null;
  company?: string | null;
  quantity: number;
  image?: string | null;
  productUrl?: string | null;
  shippingAddress?: ProductEnquiryAddress;
  billingAddress?: ProductEnquiryAddress;
  billingSameAsShipping?: boolean;
};

function parseContactMethod(value: unknown): ProductEnquiryContactMethod | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return PRODUCT_ENQUIRY_CONTACT_METHODS.includes(normalized as ProductEnquiryContactMethod)
    ? (normalized as ProductEnquiryContactMethod)
    : null;
}

function readString(record: Record<string, unknown>, key: string, max = 160) {
  return typeof record[key] === "string" ? record[key].trim().slice(0, max) : "";
}

export function parseProductEnquiryAddress(value: unknown): ProductEnquiryAddress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const address = value as Record<string, unknown>;
  const line1 = readString(address, "line1", 200);
  const city = readString(address, "city", 120);
  const state = readString(address, "state", 120);
  const country = readString(address, "country", 80) || readString(address, "region", 80);
  const postalCode = readString(address, "postalCode", 32);
  if (!line1 || !city || !state || !country || !postalCode) return null;
  if ([line1, city, state, country, postalCode].some((entry) => entry.length > 200)) return null;
  return { line1, city, state, country, postalCode };
}

function parseAddressFromFlatFields(
  record: Record<string, unknown>,
  prefix: "shipping" | "billing"
): ProductEnquiryAddress | null {
  const nested = parseProductEnquiryAddress(record[`${prefix}Address`]);
  if (nested) return nested;

  const line1 = readString(record, `${prefix}Line1`, 200) || readString(record, `${prefix}AddressLine`, 200);
  const city = readString(record, `${prefix}City`, 120);
  const state = readString(record, `${prefix}State`, 120);
  const country =
    readString(record, `${prefix}Country`, 80)
    || (prefix === "shipping" ? readString(record, "region", 80) || readString(record, "country", 80) : "");
  const postalCode = readString(record, `${prefix}PostalCode`, 32) || readString(record, `${prefix}Zip`, 32);
  if (!line1 || !city || !state || !country || !postalCode) return null;
  return { line1, city, state, country, postalCode };
}

function emptyHoneypotBody(): ProductEnquiryRequestBody {
  return {
    fullName: "",
    email: "",
    phone: "",
    region: "",
    message: "",
    productSlug: "",
    productName: "",
    productSku: "",
    preferredContactMethod: "email",
    quantity: 1
  };
}

export function parseProductEnquiryRequestBody(body: unknown): ProductEnquiryRequestBody | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.website === "string" && record.website.trim()) {
    return emptyHoneypotBody();
  }

  const fullName = typeof record.fullName === "string" ? record.fullName.trim() : "";
  const email = typeof record.email === "string" ? record.email.trim() : "";
  const phone = typeof record.phone === "string" ? record.phone.trim() : "";
  const productSlug = typeof record.productSlug === "string" ? record.productSlug.trim() : "";
  const productName = typeof record.productName === "string" ? record.productName.trim() : "";
  const productSkuRaw = typeof record.productSku === "string"
    ? record.productSku.trim()
    : typeof record.sku === "string"
      ? record.sku.trim()
      : "";
  const preferredContactMethod = parseContactMethod(record.preferredContactMethod);
  const message = typeof record.message === "string" ? record.message.trim() : "";

  const billingSameAsShipping = record.billingSameAsShipping === true
    || record.billingSameAsShipping === "true"
    || record.billingSameAsShipping === 1
    || record.billingSameAsShipping === undefined
    || record.billingSameAsShipping === null;

  let shippingAddress: ProductEnquiryAddress | null = parseAddressFromFlatFields(record, "shipping");
  // Backward-compatible: region-only payloads without address blocks are allowed;
  // legacy flat address fields still parse when present.
  if (!shippingAddress) {
    const legacyCountry = typeof record.region === "string" ? record.region.trim() : "";
    const legacyLine1 = readString(record, "shippingAddress", 200);
    if (legacyCountry && legacyLine1) {
      shippingAddress = parseProductEnquiryAddress({
        line1: legacyLine1,
        city: readString(record, "city"),
        state: readString(record, "state"),
        country: legacyCountry,
        postalCode: readString(record, "postalCode")
      });
    }
  }

  let billingAddress: ProductEnquiryAddress | null = null;
  if (billingSameAsShipping && shippingAddress) {
    billingAddress = { ...shippingAddress };
  } else if (!billingSameAsShipping) {
    billingAddress = parseAddressFromFlatFields(record, "billing");
    // Explicit separate billing requested but incomplete → reject
    if (shippingAddress && !billingAddress) return null;
  }

  const region = shippingAddress?.country
    || (typeof record.region === "string" ? record.region.trim() : "")
    || (typeof record.country === "string" ? record.country.trim() : "")
    || "India";

  if (!fullName || fullName.length < 2 || fullName.length > 120) return null;
  if (!isValidCustomerEmail(email)) return null;
  if (!isValidCustomerPhone(phone) || phone.length > 40) return null;
  if (region.length > 80) return null;
  if (!productSlug || productSlug.length > 120) return null;
  if (!productName || productName.length > 200) return null;
  if (!productSkuRaw || productSkuRaw.length > 80) return null;
  if (!preferredContactMethod) return null;
  if (message.length > 2000) return null;

  const quantityRaw = typeof record.quantity === "number" ? record.quantity : Number(record.quantity);
  const quantity = Number.isFinite(quantityRaw) ? Math.max(1, Math.min(99, Math.trunc(quantityRaw))) : 1;

  const company = typeof record.company === "string" ? record.company.trim().slice(0, 160) : null;
  const image = typeof record.image === "string" ? record.image.trim().slice(0, 500) : null;
  const productUrl = typeof record.productUrl === "string" ? record.productUrl.trim().slice(0, 500) : null;

  return {
    fullName,
    email,
    phone,
    region,
    productSlug,
    productName,
    productSku: productSkuRaw,
    preferredContactMethod,
    quantity,
    ...(shippingAddress ? { shippingAddress } : {}),
    ...(billingAddress ? { billingAddress } : {}),
    ...(shippingAddress || billingAddress ? { billingSameAsShipping: Boolean(billingSameAsShipping) } : {}),
    ...(message ? { message } : {}),
    ...(company ? { company } : {}),
    ...(image ? { image } : {}),
    ...(productUrl ? { productUrl } : {})
  };
}

export function formatProductEnquiryAddress(address: ProductEnquiryAddress) {
  return [address.line1, address.city, address.state, address.postalCode, address.country]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}
