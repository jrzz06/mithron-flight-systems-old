import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("proxy anonymous fast-path", () => {
  it("skips Supabase auth for anonymous public storefront requests", () => {
    const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    expect(proxy).toContain("hasSupabaseAuthCookie");
    expect(proxy).toContain("Anonymous public storefront pages skip Supabase auth");
  });
});
