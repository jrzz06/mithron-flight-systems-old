import { describe, expect, it } from "vitest";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirects";

describe("auth callback redirect safety", () => {
  it("allows only local redirect paths after Supabase auth exchange", () => {
    expect(getSafeAuthRedirectPath("/admin/cms")).toBe("/admin/cms");
    expect(getSafeAuthRedirectPath("/warehouse/fulfillment?q=1")).toBe("/warehouse/fulfillment?q=1");
    expect(getSafeAuthRedirectPath("https://evil.example/admin")).toBe("/admin");
    expect(getSafeAuthRedirectPath("//evil.example/admin")).toBe("/admin");
    expect(getSafeAuthRedirectPath("")).toBe("/admin");
  });
});
