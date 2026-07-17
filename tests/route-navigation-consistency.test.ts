import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function exists(path: string) {
  return existsSync(join(process.cwd(), path));
}

describe("admin warehouse operations route and navigation consistency", () => {
  it("exposes the canonical operational routes requested for the demo control flow", () => {
    expect(exists("app/(storefront)/products/page.tsx")).toBe(true);
    expect(exists("app/(storefront)/about/page.tsx")).toBe(true);
    expect(exists("app/(storefront)/contact/page.tsx")).toBe(true);
    expect(exists("app/(storefront)/account/page.tsx")).toBe(true);
    expect(exists("app/logout/route.ts")).toBe(true);
    expect(exists("app/admin/inventory/page.tsx")).toBe(true);
    expect(exists("app/admin/users/page.tsx")).toBe(true);
    expect(exists("app/warehouse/fulfillment/page.tsx")).toBe(true);
    expect(exists("app/operations/deployments/page.tsx")).toBe(true);
    expect(exists("app/operations/notifications/page.tsx")).toBe(true);
  });

  it("uses canonical navigation targets and keeps legacy routes as redirects only", () => {
    const adminNav = source("components/platform/nav-config.ts");
    const controlShell = source("components/admin/control-shell.tsx");
    const actionNav = source("components/admin/control-shell-action-nav.tsx");
    const warehousePages = [
      "app/warehouse/page.tsx",
      "app/warehouse/orders/page.tsx",
      "app/warehouse/fulfillment/page.tsx",
      "app/warehouse/activity/page.tsx"
    ].map(source).join("\n");
    const operationsPages = [
      "app/operations/page.tsx",
      "app/operations/orders/page.tsx",
      "app/operations/tasks/page.tsx"
    ].map(source).join("\n");

    expect(adminNav).toContain('href: "/admin/inventory"');
    expect(controlShell).toContain("ControlShellActionNav");
    expect(actionNav).toContain("usePathname");
    expect(actionNav).toContain("aria-current");
    expect(warehousePages).toContain("/warehouse/fulfillment");
    expect(warehousePages).toContain("/warehouse/activity");
    expect(operationsPages).toContain("/operations/deployments");
    expect(operationsPages).toContain("/operations/notifications");
    expect(operationsPages).not.toContain("/operations/requests");
  });
});
