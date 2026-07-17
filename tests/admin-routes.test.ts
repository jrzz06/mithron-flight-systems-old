import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("enterprise control route surface", () => {
  it("provides protected entry routes without changing public storefront routes", () => {
    const root = process.cwd();

    expect(existsSync(join(root, "app", "login", "page.tsx"))).toBe(true);
    expect(existsSync(join(root, "app", "admin", "page.tsx"))).toBe(true);
    expect(existsSync(join(root, "app", "warehouse", "page.tsx"))).toBe(true);
    expect(existsSync(join(root, "app", "operations", "tasks", "page.tsx"))).toBe(true);
    expect(existsSync(join(root, "proxy.ts"))).toBe(true);
    expect(existsSync(join(root, "middleware.ts"))).toBe(false);
  });
});
