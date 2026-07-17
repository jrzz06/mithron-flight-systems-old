import { fetchAdminRecordsByColumn } from "@/services/admin-actions";

type EnvSource = Record<string, string | undefined>;

export type { CustomerAddressInput, CustomerAddressRecord } from "@/services/customer-address-actions";

export async function assertCustomerAddressBelongsToUser(
  userId: string,
  addressId: string,
  env: EnvSource = process.env,
  options?: { requireShipping?: boolean; requireBilling?: boolean }
) {
  const rows = await fetchAdminRecordsByColumn("customer_addresses", "id", addressId, env);
  const row = rows[0];
  if (!row || String(row.user_id ?? "") !== userId) {
    throw new Error("Address not found for this account.");
  }
  if (options?.requireShipping && row.is_shipping === false) {
    throw new Error("Selected address is not enabled for shipping.");
  }
  if (options?.requireBilling && row.is_billing === false) {
    throw new Error("Selected address is not enabled for billing.");
  }
  return row;
}
