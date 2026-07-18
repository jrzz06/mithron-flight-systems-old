import "server-only";

import type { GuestAddress } from "@/lib/api/checkout-schema";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { formatAddressMultiline, normalizeAddressRecord, pickAddressFromMetadata, type AddressRecord } from "@/lib/addresses/format";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type JsonRecord = Record<string, unknown>;
type EnvSource = Record<string, string | undefined>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function formatGuestAddressLines(address: GuestAddress | AddressRecord): string[] {
  const record = address as AddressRecord;
  const line1 = typeof record.line1 === "string" ? record.line1.trim() : "";
  const city = typeof record.city === "string" ? record.city.trim() : "";
  const region = typeof record.region === "string" ? record.region.trim() : "";
  const postalCode =
    typeof record.postalCode === "string"
      ? record.postalCode.trim()
      : typeof record.postal_code === "string"
        ? record.postal_code.trim()
        : "";
  const line2 = typeof record.line2 === "string" ? record.line2.trim() : "";
  const country = typeof record.country === "string" ? record.country.trim() : "India";
  const cityLine = [city, region, postalCode].filter(Boolean).join(", ");
  return [line1, line2, cityLine, country].filter((line) => line.length > 0);
}

export function savedAddressRowToGuestSnapshot(row: JsonRecord): GuestAddress {
  return {
    line1: String(row.line1 ?? ""),
    city: String(row.city ?? ""),
    region: String(row.region ?? ""),
    postalCode: String(row.postal_code ?? ""),
    ...(typeof row.label === "string" && row.label.trim() ? { label: row.label.trim() } : {})
  };
}

export function savedAddressRowToRecord(row: JsonRecord): AddressRecord {
  return {
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    region: row.region,
    postal_code: row.postal_code,
    postalCode: row.postal_code,
    country: row.country ?? "India",
    label: row.label,
    phone: row.phone
  };
}

async function fetchCustomerAddress(
  addressId: string,
  userId: string | null,
  env: EnvSource = process.env
): Promise<JsonRecord | null> {
  if (!addressId || !userId) return null;
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/customer_addresses?select=id,user_id,label,line1,line2,city,region,postal_code,country,phone,is_billing,is_shipping&user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(addressId)}&limit=1`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      },
      cache: "no-store"
    }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as JsonRecord[];
  return rows[0] ?? null;
}

export async function resolveOrderAddresses(
  metadataInput: JsonRecord,
  userId: string | null,
  env: EnvSource = process.env,
  orderRecord?: JsonRecord | null
) {
  const metadata = asRecord(metadataInput);
  const shippingFromMetadata = asRecord(metadata.shipping_address);
  const billingFromMetadata = asRecord(metadata.billing_address);
  const guestShipping = asRecord(metadata.guest_shipping_address);
  const guestBilling = asRecord(metadata.guest_billing_address);
  const billingSameAsShipping = metadata.billing_same_as_shipping !== false;

  const shippingAddressId =
    typeof orderRecord?.shipping_address_id === "string"
      ? orderRecord.shipping_address_id
      : typeof metadata.shipping_address_id === "string"
        ? metadata.shipping_address_id
        : null;
  const billingAddressId =
    typeof orderRecord?.billing_address_id === "string"
      ? orderRecord.billing_address_id
      : typeof metadata.billing_address_id === "string"
        ? metadata.billing_address_id
        : null;

  const savedShipping = shippingAddressId ? await fetchCustomerAddress(shippingAddressId, userId, env) : null;
  const savedBilling = billingAddressId ? await fetchCustomerAddress(billingAddressId, userId, env) : null;

  const shippingRecord: AddressRecord | null =
    normalizeAddressRecord(shippingFromMetadata)
    ?? normalizeAddressRecord(guestShipping)
    ?? (savedShipping ? savedAddressRowToRecord(savedShipping) : null);

  let billingRecord: AddressRecord | null =
    normalizeAddressRecord(billingFromMetadata)
    ?? normalizeAddressRecord(guestBilling)
    ?? (savedBilling ? savedAddressRowToRecord(savedBilling) : null);

  if (!billingRecord && billingSameAsShipping) {
    billingRecord = shippingRecord;
  }

  return {
    billingSameAsShipping,
    shippingAddress: shippingRecord,
    billingAddress: billingRecord,
    shippingAddressLines: shippingRecord ? formatGuestAddressLines(shippingRecord) : ["—"],
    billingAddressLines: billingRecord ? formatGuestAddressLines(billingRecord) : shippingRecord ? formatGuestAddressLines(shippingRecord) : ["—"],
    shippingDisplay: formatAddressMultiline(shippingRecord),
    billingDisplay: formatAddressMultiline(billingRecord ?? (billingSameAsShipping ? shippingRecord : null))
  };
}

export async function buildCheckoutAddressMetadata(
  input: {
    addressId?: string;
    billingAddressId?: string;
    guestAddress?: GuestAddress;
    guestBillingAddress?: GuestAddress;
    billingSameAsShipping?: boolean;
  },
  userId: string | null,
  env: EnvSource = process.env
) {
  const billingSameAsShipping = input.billingSameAsShipping !== false;
  let shippingSnapshot = input.guestAddress ?? null;
  let billingSnapshot = input.guestBillingAddress ?? null;

  if (userId && input.addressId && !shippingSnapshot) {
    const saved = await fetchCustomerAddress(input.addressId, userId, env);
    if (saved) shippingSnapshot = savedAddressRowToGuestSnapshot(saved);
  }

  if (billingSameAsShipping) {
    billingSnapshot = shippingSnapshot;
  } else if (userId && input.billingAddressId && !billingSnapshot) {
    const saved = await fetchCustomerAddress(input.billingAddressId, userId, env);
    if (saved) billingSnapshot = savedAddressRowToGuestSnapshot(saved);
  }

  const resolvedBillingAddressId = billingSameAsShipping
    ? input.addressId ?? input.billingAddressId ?? null
    : input.billingAddressId ?? null;

  return {
    shipping_address_id: input.addressId ?? null,
    billing_address_id: resolvedBillingAddressId,
    billing_same_as_shipping: billingSameAsShipping,
    ...(shippingSnapshot ? { guest_shipping_address: shippingSnapshot, shipping_address: shippingSnapshot } : {}),
    ...(billingSnapshot
      ? { guest_billing_address: billingSnapshot, billing_address: billingSnapshot }
      : billingSameAsShipping && shippingSnapshot
        ? { billing_address: shippingSnapshot }
        : {})
  };
}

function resolveOrderAddressesFromMetadata(metadataInput: JsonRecord) {
  const metadata = asRecord(metadataInput);
  const shippingAddress = pickAddressFromMetadata(metadata, "shipping");
  const billingAddress = pickAddressFromMetadata(metadata, "billing");
  const billingSameAsShipping = metadata.billing_same_as_shipping !== false;

  return {
    billingSameAsShipping,
    shippingAddress,
    billingAddress,
    shippingDisplay: formatAddressMultiline(shippingAddress),
    billingDisplay: formatAddressMultiline(billingAddress)
  };
}
