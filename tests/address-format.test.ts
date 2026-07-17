import { describe, expect, it } from "vitest";
import { formatAddressInline, normalizeAddressRecord } from "@/lib/addresses/format";

describe("address format", () => {
  it("formats admin shipping addresses that store state instead of region", () => {
    const address = normalizeAddressRecord({
      line1: "12 Field Lane",
      line2: "",
      city: "Pune",
      state: "Maharashtra",
      postal_code: "411001",
      country: "India"
    });

    expect(formatAddressInline(address)).toBe("12 Field Lane, Pune, Maharashtra, 411001, India");
  });
});
