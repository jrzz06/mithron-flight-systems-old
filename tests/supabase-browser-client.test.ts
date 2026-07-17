import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getSupabasePublicConfig } from "@/lib/env";

describe("supabase browser client config", () => {
  it("reads public supabase env with static NEXT_PUBLIC keys for client bundling", () => {
    const source = readFileSync(join(process.cwd(), "lib/client.ts"), "utf8");

    expect(source).toContain("getSupabasePublicConfig");
    expect(source).not.toContain("resolveSupabasePublishableKey");
    expect(getSupabasePublicConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test"
    })).toEqual({
      configured: true,
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_test"
    });
  });
});
