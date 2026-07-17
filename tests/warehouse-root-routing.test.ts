import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("warehouse root routing", () => {
  it("redirects the warehouse root to the dedicated operational dashboard", () => {
    const page = source("app/warehouse/page.tsx");

    expect(page).toContain('redirect("/warehouse/dashboard")');
    expect(page).not.toContain("getWarehouseSnapshot");
    expect(page).not.toContain("data-warehouse-live-dashboard");
    expect(page).not.toContain('href: "/warehouse/shipments"');
    expect(page).not.toContain('href: "/warehouse/movements"');
  });
});
