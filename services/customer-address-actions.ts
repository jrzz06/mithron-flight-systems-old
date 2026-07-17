import "server-only";

import { assertAddressUsage, mergeAddressUsageFlags } from "@/lib/customer/address-usage";
import { createClient } from "@/lib/server";

type CustomerAddressClient = Awaited<ReturnType<typeof createClient>>;

export type CustomerAddressInput = {
  label?: string;
  line1: string;
  line2?: string | null;
  city: string;
  region: string;
  postalCode: string;
  country?: string;
  phone?: string | null;
  isDefault?: boolean;
  isBilling?: boolean;
  isShipping?: boolean;
};

export type CustomerAddressRecord = {
  id: string;
  user_id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  phone: string | null;
  is_default: boolean;
  is_billing: boolean;
  is_shipping: boolean;
  created_at: string;
  updated_at: string;
};

const ADDRESS_SELECT =
  "id,user_id,label,line1,line2,city,region,postal_code,country,phone,is_default,is_billing,is_shipping,created_at,updated_at";

async function requireAuthenticatedUserId(supabase: CustomerAddressClient) {
  const { data: claimsData } = await supabase.auth.getClaims();
  const claimsUserId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  if (claimsUserId) {
    return claimsUserId;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (!userError && userData.user?.id) {
    return userData.user.id;
  }

  throw new Error("Authentication required.");
}

function toInsertRow(userId: string, input: CustomerAddressInput) {
  assertAddressUsage({
    isBilling: input.isBilling,
    isShipping: input.isShipping
  });

  return {
    user_id: userId,
    label: input.label?.trim() || "Home",
    line1: input.line1.trim(),
    line2: input.line2?.trim() || null,
    city: input.city.trim(),
    region: input.region.trim(),
    postal_code: input.postalCode.trim(),
    country: input.country?.trim() || "India",
    phone: input.phone?.trim() || null,
    is_default: input.isDefault ?? false,
    is_billing: input.isBilling ?? true,
    is_shipping: input.isShipping ?? true,
    updated_at: new Date().toISOString()
  };
}

function toUpdateRow(input: Partial<CustomerAddressInput>) {
  const patch: Record<string, string | boolean | null> = {
    updated_at: new Date().toISOString()
  };

  if (input.label !== undefined) patch.label = input.label.trim() || "Home";
  if (input.line1 !== undefined) patch.line1 = input.line1.trim();
  if (input.line2 !== undefined) patch.line2 = input.line2?.trim() || null;
  if (input.city !== undefined) patch.city = input.city.trim();
  if (input.region !== undefined) patch.region = input.region.trim();
  if (input.postalCode !== undefined) patch.postal_code = input.postalCode.trim();
  if (input.country !== undefined) patch.country = input.country.trim() || "India";
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.isDefault !== undefined) patch.is_default = input.isDefault;
  if (input.isBilling !== undefined) patch.is_billing = input.isBilling;
  if (input.isShipping !== undefined) patch.is_shipping = input.isShipping;

  return patch;
}

function formatAddressMutationError(action: "read" | "create" | "update" | "delete", message?: string) {
  if (message?.includes("customer_addresses_usage_check")) {
    return "An address must be enabled for shipping, billing, or both.";
  }

  return message?.trim()
    ? `Failed to ${action} address: ${message}`
    : `Failed to ${action} address.`;
}

async function getOwnedAddress(
  client: CustomerAddressClient,
  addressId: string
): Promise<CustomerAddressRecord> {
  const { data, error } = await client
    .from("customer_addresses")
    .select(ADDRESS_SELECT)
    .eq("id", addressId)
    .maybeSingle();

  if (error) {
    throw new Error(formatAddressMutationError("read", error.message));
  }

  if (!data) {
    throw new Error("Address not found for this account.");
  }

  return data as CustomerAddressRecord;
}

export async function listCustomerAddresses(
  supabase?: CustomerAddressClient
): Promise<CustomerAddressRecord[]> {
  const client = supabase ?? await createClient();
  await requireAuthenticatedUserId(client);

  const { data, error } = await client
    .from("customer_addresses")
    .select(ADDRESS_SELECT)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(formatAddressMutationError("read", error.message));
  }

  return (data ?? []) as CustomerAddressRecord[];
}

export async function createCustomerAddress(
  input: CustomerAddressInput,
  supabase?: CustomerAddressClient
): Promise<CustomerAddressRecord> {
  const client = supabase ?? await createClient();
  const userId = await requireAuthenticatedUserId(client);

  const { data, error } = await client
    .from("customer_addresses")
    .insert(toInsertRow(userId, input))
    .select(ADDRESS_SELECT)
    .single();

  if (error || !data) {
    throw new Error(formatAddressMutationError("create", error?.message));
  }

  return data as CustomerAddressRecord;
}

export async function updateCustomerAddress(
  addressId: string,
  input: Partial<CustomerAddressInput>,
  supabase?: CustomerAddressClient
): Promise<CustomerAddressRecord> {
  const client = supabase ?? await createClient();
  await requireAuthenticatedUserId(client);

  if (!addressId.trim()) {
    throw new Error("Address not found for this account.");
  }

  const existing = await getOwnedAddress(client, addressId);

  if (input.isBilling !== undefined || input.isShipping !== undefined) {
    const mergedUsage = mergeAddressUsageFlags(
      { isBilling: existing.is_billing, isShipping: existing.is_shipping },
      {
        isBilling: input.isBilling,
        isShipping: input.isShipping
      }
    );
    assertAddressUsage(mergedUsage);
  }

  const { data, error } = await client
    .from("customer_addresses")
    .update(toUpdateRow(input))
    .eq("id", addressId)
    .select(ADDRESS_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error(formatAddressMutationError("update", error.message));
  }

  if (!data) {
    throw new Error("Address not found for this account.");
  }

  return data as CustomerAddressRecord;
}

export async function deleteCustomerAddress(
  addressId: string,
  supabase?: CustomerAddressClient
): Promise<void> {
  const client = supabase ?? await createClient();
  await requireAuthenticatedUserId(client);

  if (!addressId.trim()) {
    throw new Error("Address not found for this account.");
  }

  const { data, error } = await client
    .from("customer_addresses")
    .delete()
    .eq("id", addressId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(formatAddressMutationError("delete", error.message));
  }

  if (!data) {
    throw new Error("Address not found for this account.");
  }
}
