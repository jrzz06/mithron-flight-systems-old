import { describe, expect, it, vi } from "vitest";
import { resolvePostAuthRedirectWithProfileCheck } from "@/lib/auth/post-auth-redirect";

vi.mock("@/lib/auth/profile-identity", () => ({
  isUserProfileIdentityComplete: vi.fn().mockResolvedValue(false),
  buildProfileCompletionRedirect: (next: string) => `/account/complete-profile?next=${encodeURIComponent(next)}`
}));

describe("resolvePostAuthRedirectWithProfileCheck", () => {
  it("skips profile completion for admin staff", async () => {
    const redirect = await resolvePostAuthRedirectWithProfileCheck({
      user: {
        id: "a0000000-0000-4000-8000-000000000001",
        app_metadata: { role: "admin" }
      } as never,
      role: "admin",
      nextPath: "/admin"
    });

    expect(redirect).toBe("/admin");
  });
});
