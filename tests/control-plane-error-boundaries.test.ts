import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("control plane error boundaries", () => {
  it("adds admin and warehouse segment recovery screens for render crashes", () => {
    expect(existsSync(join(root, "app", "admin", "error.tsx"))).toBe(true);
    expect(existsSync(join(root, "app", "warehouse", "error.tsx"))).toBe(true);

    const adminBoundary = source("app/admin/error.tsx");
    const warehouseBoundary = source("app/warehouse/error.tsx");

    for (const boundary of [adminBoundary, warehouseBoundary]) {
      expect(boundary).toContain("\"use client\"");
      expect(boundary).toContain("reset()");
      expect(boundary).toContain("console.error");
      expect(boundary).toContain("Try again");
    }

    expect(adminBoundary).toContain("data-admin-error-boundary");
    expect(adminBoundary).toContain("/admin");
    expect(warehouseBoundary).toContain("data-warehouse-error-boundary");
    expect(warehouseBoundary).toContain("/warehouse/dashboard");
  });
});
