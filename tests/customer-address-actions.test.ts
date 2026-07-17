import { describe, expect, it } from "vitest";
import { assertAddressUsage, mergeAddressUsageFlags } from "@/lib/customer/address-usage";
import { roleHasPermission } from "@/lib/auth/permissions";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("customer address actions", () => {
  it("uses authenticated Supabase client mutations instead of admin record helpers", () => {
    const service = source("services/customer-address-actions.ts");
    const legacy = source("services/customer-addresses.ts");

    expect(existsSync(join(root, "services/customer-address-actions.ts"))).toBe(true);
    expect(service).toContain('from("customer_addresses")');
    expect(service).toContain("requireAuthenticatedUserId");
    expect(service).toContain("auth.getUser()");
    expect(service).not.toContain("createAdminRecord");
    expect(service).not.toContain("updateAdminRecord");
    expect(service).not.toContain("deleteAdminRecord");
    expect(service).not.toContain("enquiries.write");
    expect(legacy).toContain("assertCustomerAddressBelongsToUser");
    expect(legacy).not.toContain("createAdminRecord");
  });

  it("routes account address forms through the authenticated service", () => {
    const actions = source("app/(storefront)/account/addresses/actions.ts");

    expect(actions).toContain('@/services/customer-address-actions');
    expect(actions).not.toContain('@/services/customer-addresses');
    expect(actions).toContain("createCustomerAddress(shippingInput, supabase)");
    expect(actions).toContain("updateCustomerAddress(addressId, { isDefault: true }, supabase)");
  });

  it("returns structured action state instead of throwing user-facing errors", () => {
    const actions = source("app/(storefront)/account/addresses/actions.ts");
    const state = source("app/(storefront)/account/addresses/address-action-state.ts");
    const manager = source("components/account/address-manager.tsx");

    expect(state).toContain("export type AddressActionState");
    expect(state).toContain("export const initialAddressActionState");
    expect(actions).not.toContain("export const initialAddressActionState");
    expect(actions).toContain("return { ok: true }");
    expect(actions).toContain("return { ok: false, error:");
    expect(actions).toContain("toActionError(error)");
    expect(manager).toContain("useActionState(createAddressFormAction");
    expect(manager).toContain("useActionState(updateAddressFormAction");
    expect(manager).toContain("useActionState(deleteAddressFormAction");
    expect(manager).toContain("useActionState(setDefaultAddressFormAction");
    expect(manager).toContain('from "@/app/(storefront)/account/addresses/address-action-state"');
  });

  it("keeps checkout ownership checks on the server-side verifier", () => {
    const checkout = source("app/api/checkout/route.ts");
    const enquiryCheckout = source("app/api/checkout/enquiry/route.ts");

    expect(checkout).toContain("assertCustomerAddressBelongsToUser");
    expect(enquiryCheckout).toContain("assertCustomerAddressBelongsToUser");
  });

  it("does not require enquiries.write for customer self-service address saves", () => {
    expect(roleHasPermission("user", "enquiries.write")).toBe(false);
    expect(roleHasPermission("user", "account.read.self")).toBe(true);
  });
});

describe("address usage validation", () => {
  it("merges billing and shipping flags before validating partial updates", () => {
    expect(
      mergeAddressUsageFlags(
        { isBilling: true, isShipping: false },
        { isShipping: false }
      )
    ).toEqual({ isBilling: true, isShipping: false });

    expect(() =>
      assertAddressUsage(
        mergeAddressUsageFlags(
          { isBilling: true, isShipping: true },
          { isBilling: false, isShipping: false }
        )
      )
    ).toThrow("An address must be enabled for shipping, billing, or both.");
  });
});
