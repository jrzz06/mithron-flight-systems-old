import { describe, expect, it } from "vitest";
import { mapAuthErrorForClient } from "@/lib/auth/client-errors";
import { getAuthProviderAvailability } from "@/lib/auth/provider-registry";

describe("auth provider registry", () => {
  it("hides google when supabase is not configured", () => {
    const providers = getAuthProviderAvailability({
      AUTH_PROVIDER_GOOGLE_ENABLED: "true",
      AUTH_PROVIDER_EMAIL_ENABLED: "true"
    });

    expect(providers.google).toBe(false);
    expect(providers.email).toBe(false);
  });

  it("respects provider feature flags", () => {
    const providers = getAuthProviderAvailability({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      AUTH_PROVIDER_GOOGLE_ENABLED: "true",
      AUTH_PROVIDER_EMAIL_ENABLED: "true"
    });

    expect(providers.google).toBe(true);
    expect(providers.email).toBe(true);
  });
});

describe("auth client errors", () => {
  it("sanitizes provider-specific failures", () => {
    expect(mapAuthErrorForClient("Invalid login credentials")).toBe("Invalid email or password.");
    expect(mapAuthErrorForClient("auth/popup-closed-by-user")).toBe("Sign-in was cancelled.");
  });
});
