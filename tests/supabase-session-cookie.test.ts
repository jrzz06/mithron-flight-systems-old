import { describe, expect, it } from "vitest";
import { hasSupabaseAuthCookie } from "@/lib/auth/supabase-session-cookie";

describe("hasSupabaseAuthCookie", () => {
  it("detects chunked Supabase auth cookies", () => {
    expect(
      hasSupabaseAuthCookie([
        { name: "sb-project-auth-token", value: "abc" },
        { name: "sb-project-auth-token.0", value: "chunk" }
      ])
    ).toBe(true);
  });

  it("returns false when no auth cookie is present", () => {
    expect(hasSupabaseAuthCookie([{ name: "theme", value: "dark" }])).toBe(false);
  });
});
