import { describe, expect, it } from "vitest";
import { resolveSupplierVerificationStatus } from "@/services/admin";

describe("supplier verification status", () => {
  it("maps confirmed + active governance to verified", () => {
    expect(
      resolveSupplierVerificationStatus({
        governanceStatus: "active",
        emailConfirmedAt: "2026-01-01T00:00:00.000Z",
        bannedUntil: null
      })
    ).toBe("verified");
  });

  it("maps unconfirmed email to pending even when governance is active", () => {
    expect(
      resolveSupplierVerificationStatus({
        governanceStatus: "active",
        emailConfirmedAt: null,
        bannedUntil: null
      })
    ).toBe("pending");
  });

  it("maps disabled governance or ban to disabled", () => {
    expect(
      resolveSupplierVerificationStatus({
        governanceStatus: "disabled",
        emailConfirmedAt: "2026-01-01T00:00:00.000Z",
        bannedUntil: null
      })
    ).toBe("disabled");
    expect(
      resolveSupplierVerificationStatus({
        governanceStatus: "active",
        emailConfirmedAt: "2026-01-01T00:00:00.000Z",
        bannedUntil: "2099-01-01T00:00:00.000Z"
      })
    ).toBe("disabled");
  });
});
