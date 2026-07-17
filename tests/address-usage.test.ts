import { describe, expect, it } from "vitest";
import { assertAddressUsage, mergeAddressUsageFlags } from "@/lib/customer/address-usage";

describe("address usage helpers", () => {
  it("keeps unchanged flags when a patch omits them", () => {
    expect(
      mergeAddressUsageFlags(
        { isBilling: false, isShipping: true },
        { isBilling: false }
      )
    ).toEqual({ isBilling: false, isShipping: true });
  });

  it("rejects addresses that are neither billing nor shipping", () => {
    expect(() => assertAddressUsage({ isBilling: false, isShipping: false })).toThrow(
      "An address must be enabled for shipping, billing, or both."
    );
  });
});
