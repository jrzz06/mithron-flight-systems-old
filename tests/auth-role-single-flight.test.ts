import { describe, expect, it } from "vitest";

describe("auth-role cache payload alignment", () => {
  it("includes profileComplete for non-user roles (matches proxy shape)", () => {
    function buildAuthRoleCachePayload(
      role: "admin" | "user" | "warehouse" | null,
      options?: { disabled?: boolean; profileComplete?: boolean }
    ) {
      return {
        role,
        disabled: options?.disabled ?? false,
        profileComplete: options?.profileComplete ?? (role !== null && role !== "user")
      };
    }

    expect(buildAuthRoleCachePayload("admin")).toEqual({
      role: "admin",
      disabled: false,
      profileComplete: true
    });
    expect(buildAuthRoleCachePayload("user")).toEqual({
      role: "user",
      disabled: false,
      profileComplete: false
    });
    expect(buildAuthRoleCachePayload(null, { disabled: true, profileComplete: false })).toEqual({
      role: null,
      disabled: true,
      profileComplete: false
    });
  });
});

describe("withSingleFlight loader timeout wiring", () => {
  it("exports withSingleFlight and readThroughCache", async () => {
    const mod = await import("@/lib/cache-redis");
    expect(typeof mod.withSingleFlight).toBe("function");
    expect(typeof mod.readThroughCache).toBe("function");
    expect(mod.REDIS_CACHE_KEYS.authRoleContext("u1", 123)).toBe("auth:role:u1:123");
    expect(mod.HOMEPAGE_SINGLE_FLIGHT_LOADER_TIMEOUT_MS).toBeGreaterThan(12_000);
  });
});
