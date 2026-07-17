import { redirect } from "next/navigation";
import { AddressManager } from "@/components/account/address-manager";
import { AccountPage as AccountPageShell } from "@/components/account";
import { createClient } from "@/lib/server";
import { getCurrentAuthContext } from "@/services/auth";
import { listCustomerAddresses } from "@/services/customer-address-actions";

export default async function AccountAddressesPage() {
  const context = await getCurrentAuthContext();
  if (!context.userId) redirect("/login?next=/account/addresses");

  const supabase = await createClient();
  const addresses = await listCustomerAddresses(supabase);

  return (
    <AccountPageShell>
      <AddressManager
        addresses={addresses.map((address) => ({
          id: String(address.id),
          label: typeof address.label === "string" ? address.label : null,
          line1: String(address.line1 ?? ""),
          line2: typeof address.line2 === "string" ? address.line2 : null,
          city: String(address.city ?? ""),
          region: String(address.region ?? ""),
          postal_code: String(address.postal_code ?? ""),
          country: typeof address.country === "string" ? address.country : null,
          phone: typeof address.phone === "string" ? address.phone : null,
          is_default: Boolean(address.is_default),
          is_billing: address.is_billing !== false,
          is_shipping: address.is_shipping !== false
        }))}
      />
    </AccountPageShell>
  );
}
