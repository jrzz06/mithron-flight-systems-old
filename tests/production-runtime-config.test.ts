import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("production runtime config", () => {
  it("blocks ALLOW_DEMO_SEED in production startup checks", () => {
    const env = readFileSync(join(process.cwd(), "lib/env.ts"), "utf8");
    expect(env).toContain('ALLOW_DEMO_SEED must not be true in production');
  });
});
