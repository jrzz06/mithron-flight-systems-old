import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const CRITICAL_SUPPLIER_ROUTES = [
  "app/supplier/page.tsx",
  "app/supplier/layout.tsx",
  "app/supplier/not-found.tsx",
  "app/supplier/@shell/default.tsx",
  "app/supplier/products/page.tsx",
  "app/supplier/products/new/page.tsx",
  "app/supplier/products/[slug]/edit/page.tsx",
  "app/supplier/submissions/page.tsx",
  "app/supplier/inventory/page.tsx",
  "app/api/supplier/nav-metrics/route.ts"
] as const;

describe("supplier route existence guard", () => {
  it("keeps critical supplier panel routes and nav-metrics API on disk", () => {
    for (const route of CRITICAL_SUPPLIER_ROUTES) {
      expect(existsSync(join(root, route)), `missing ${route}`).toBe(true);
    }
  });

  it("wires supplier topbar Add product to /supplier/products/new", () => {
    const shell = readFileSync(join(root, "app/supplier/@shell/default.tsx"), "utf8");
    const topbar = readFileSync(join(root, "components/platform/platform-topbar.tsx"), "utf8");
    expect(shell).toContain('href: "/supplier/products/new"');
    expect(topbar).toContain('scope === "supplier"');
    expect(topbar).toContain('href: "/supplier/products/new"');
  });

  it("provides supplier-scoped not-found recovery links", () => {
    const notFound = readFileSync(join(root, "app/supplier/not-found.tsx"), "utf8");
    expect(notFound).toContain("/supplier/products");
    expect(notFound).toContain("/supplier");
    expect(notFound).not.toContain("Back to Mithron");
  });
});
