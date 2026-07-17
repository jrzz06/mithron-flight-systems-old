import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/admin-settings-policy", () => ({
  getAdminSettingsPolicy: vi.fn(async () => ({ queryCachingEnabled: false }))
}));

describe("control plane query cache", () => {
  it("bypasses cache when query caching is disabled", async () => {
    const { cacheControlPlaneRead } = await import("@/lib/control-plane/query-cache");
    const loader = vi.fn(async () => 7);
    await expect(cacheControlPlaneRead(["test"], loader)).resolves.toBe(7);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
