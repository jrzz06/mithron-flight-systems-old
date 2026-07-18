export type AddressRecord = Record<string, unknown>;

export type ShippingAddressFieldKey = "line1" | "city" | "state" | "postalCode" | "country";

export const SHIPPING_ADDRESS_FIELD_LABELS: Record<ShippingAddressFieldKey, string> = {
  line1: "street address",
  city: "city",
  state: "state / province",
  postalCode: "postal code",
  country: "country"
};

/** Default country when guest/enquiry payloads omit it but other fields are present. */
export const DEFAULT_SHIPPING_COUNTRY = "India";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAddressRecord(value: unknown): AddressRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as AddressRecord;
  const line1 = text(record.line1);
  if (!line1) return null;
  return record;
}

/** Normalized view of a shipping/billing address for completeness checks and form prefills. */
export function readShippingAddressFields(
  value: unknown,
  countryFallback = DEFAULT_SHIPPING_COUNTRY
): Record<ShippingAddressFieldKey, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as AddressRecord;
  const line1 = text(record.line1);
  const city = text(record.city);
  const state = text(record.state) || text(record.region);
  const postalCode = text(record.postal_code) || text(record.postalCode);
  const country = text(record.country) || text(countryFallback);
  if (!line1 && !city && !state && !postalCode && !text(record.country)) return null;
  return { line1, city, state, postalCode, country };
}

export function getMissingShippingAddressFields(
  address: Record<ShippingAddressFieldKey, string> | null | undefined
): ShippingAddressFieldKey[] {
  if (!address) return ["line1", "city", "state", "postalCode", "country"];
  const missing: ShippingAddressFieldKey[] = [];
  if (!address.line1) missing.push("line1");
  if (!address.city) missing.push("city");
  if (!address.state) missing.push("state");
  if (!address.postalCode) missing.push("postalCode");
  if (!address.country) missing.push("country");
  return missing;
}

export function isCompleteShippingAddressFields(
  address: Record<ShippingAddressFieldKey, string> | null | undefined
) {
  return getMissingShippingAddressFields(address).length === 0;
}

/**
 * Resolve shipping address from order/enquiry metadata for fulfillment readiness.
 * Prefers shipping_address, falls back to guest_shipping_address; defaults country to India.
 */
export function resolveShippingAddressForCompleteness(
  metadata: AddressRecord,
  countryFallback = DEFAULT_SHIPPING_COUNTRY
) {
  return (
    readShippingAddressFields(metadata.shipping_address, countryFallback)
    ?? readShippingAddressFields(metadata.guest_shipping_address, countryFallback)
  );
}

export function formatMissingShippingAddressLabels(keys: ShippingAddressFieldKey[]) {
  return keys.map((key) => SHIPPING_ADDRESS_FIELD_LABELS[key]).join(", ");
}

export function formatAddressMultiline(address: AddressRecord | null | undefined): string {
  if (!address) return "";
  const parts = [
    address.line1,
    address.line2,
    [address.city, address.region ?? address.state, address.postal_code ?? address.postalCode]
      .filter((part) => text(part))
      .join(", "),
    address.country
  ].map((part) => text(part)).filter(Boolean);
  return parts.join("\n");
}

export function formatAddressInline(address: AddressRecord | null | undefined): string {
  if (!address) return "";
  return formatAddressMultiline(address).replace(/\n/g, ", ");
}

export function pickAddressFromMetadata(metadata: AddressRecord, kind: "shipping" | "billing"): AddressRecord | null {
  if (kind === "shipping") {
    return (
      normalizeAddressRecord(metadata.shipping_address)
      ?? normalizeAddressRecord(metadata.guest_shipping_address)
    );
  }

  const billingSameAsShipping = metadata.billing_same_as_shipping !== false;
  const billing =
    normalizeAddressRecord(metadata.billing_address)
    ?? normalizeAddressRecord(metadata.guest_billing_address);

  if (billing) return billing;
  if (billingSameAsShipping) {
    return pickAddressFromMetadata(metadata, "shipping");
  }
  return null;
}

function addressesEquivalent(
  left: AddressRecord | null | undefined,
  right: AddressRecord | null | undefined
) {
  if (!left || !right) return false;
  const keys = ["line1", "line2", "city", "region", "postal_code", "postalCode", "country"] as const;
  return keys.every((key) => text(left[key]) === text(right[key]));
}
