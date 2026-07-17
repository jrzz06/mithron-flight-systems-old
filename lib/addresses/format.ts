export type AddressRecord = Record<string, unknown>;

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
