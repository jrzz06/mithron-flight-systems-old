import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_LIVE_RESOURCES,
  isAdminLiveResourceId
} from "@/lib/admin/realtime/admin-resource-registry";

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin live resource api", () => {
  it("whitelists only canonical admin live resource ids", () => {
    for (const resource of ADMIN_LIVE_RESOURCES) {
      expect(isAdminLiveResourceId(resource)).toBe(true);
    }

    expect(isAdminLiveResourceId("orders")).toBe(true);
    expect(isAdminLiveResourceId("inventory")).toBe(true);
    expect(isAdminLiveResourceId("nav_metrics")).toBe(true);
    expect(isAdminLiveResourceId("unknown-resource")).toBe(false);
    expect(isAdminLiveResourceId("")).toBe(false);
    expect(isAdminLiveResourceId("ORDERS")).toBe(false);
  });

  it("requires admin route access and rejects unknown resources", () => {
    const route = readWorkspaceFile("app/api/admin/live/[resource]/route.ts");

    expect(route).toContain('requireRouteAccess("/admin")');
    expect(route).toContain("isAdminLiveResourceId(resource)");
    expect(route).toContain("Unknown admin live resource.");
    expect(route).toContain("status: 404");
    expect(route).toContain("loadAdminLiveResource");
  });
});
