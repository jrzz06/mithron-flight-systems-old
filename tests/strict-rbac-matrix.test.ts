import { describe, expect, it } from "vitest";
import {
  authorizeRoute,
  canAccessProtectedPath,
  resolveApiRoutePolicy
} from "@/lib/auth/access-control";

describe("strict enterprise RBAC matrix", () => {
  const roles = ["admin", "warehouse", "supplier", "user"] as const;
  const workspaces = [
    { role: "admin", path: "/admin" },
    { role: "warehouse", path: "/warehouse/dashboard" },
    { role: "supplier", path: "/supplier" }
  ] as const;

  it.each(workspaces)("allows only $role into $path", ({ role, path }) => {
    expect(canAccessProtectedPath(role, path)).toBe(true);
  });

  it.each([
    ["admin", "/supplier"],
    ["admin", "/warehouse/dashboard"],
    ["warehouse", "/admin"],
    ["warehouse", "/supplier"],
    ["supplier", "/admin"],
    ["supplier", "/warehouse/dashboard"]
  ] as const)("denies cross-role access for %s -> %s", (role, path) => {
    expect(canAccessProtectedPath(role, path)).toBe(false);
    const authorization = authorizeRoute(role, path, { userId: "user-1" });
    expect(authorization.allowed).toBe(false);
    if (!authorization.allowed) {
      expect(authorization.httpStatus).toBe(403);
    }
  });

  it("requires authentication for protected routes", () => {
    const authorization = authorizeRoute(null, "/admin", { userId: null });
    expect(authorization.allowed).toBe(false);
    if (!authorization.allowed) {
      expect(authorization.httpStatus).toBe(401);
      expect(authorization.redirectPath).toBe("/login");
    }
  });

  it("classifies API routes for centralized middleware", () => {
    expect(resolveApiRoutePolicy("/api/health")?.kind).toBe("public");
    expect(resolveApiRoutePolicy("/api/cart/pricing")?.kind).toBe("public");
    expect(resolveApiRoutePolicy("/api/ai/assistant")?.kind).toBe("public");
    expect(resolveApiRoutePolicy("/api/products/summary")?.kind).toBe("public");
    expect(resolveApiRoutePolicy("/api/checkout/enquiry")?.kind).toBe("session_or_guest");
    expect(resolveApiRoutePolicy("/api/checkout/status")?.kind).toBe("session_or_guest");
    expect(resolveApiRoutePolicy("/api/account/addresses")?.kind).toBe("session");
    expect(resolveApiRoutePolicy("/api/admin/archive-movements")?.kind).toBe("bearer");
    expect(resolveApiRoutePolicy("/api/admin/prune-logs")?.kind).toBe("bearer");
    expect(resolveApiRoutePolicy("/api/admin/prune-redis-ttls")?.kind).toBe("bearer");
    expect(resolveApiRoutePolicy("/api/admin/archive-operational-data")?.kind).toBe("bearer");
    expect(resolveApiRoutePolicy("/api/admin/publish-scheduled-blog")?.kind).toBe("bearer");
    expect(resolveApiRoutePolicy("/api/admin/nav-metrics")?.kind).toBe("admin");
    expect(resolveApiRoutePolicy("/api/admin/live/orders")?.kind).toBe("admin");
    expect(resolveApiRoutePolicy("/api/admin/catalog/products")?.kind).toBe("admin");
    expect(resolveApiRoutePolicy("/api/admin/customers/lookup")?.kind).toBe("admin");
    expect(resolveApiRoutePolicy("/api/security/denials")?.kind).toBe("staff");
  });

  it("keeps each role out of foreign workspaces", () => {
    for (const actor of roles) {
      for (const workspace of workspaces) {
        const allowed = canAccessProtectedPath(actor, workspace.path);
        if (actor === workspace.role) {
          expect(allowed).toBe(true);
        } else {
          expect(allowed).toBe(false);
        }
      }
    }
  });
});
