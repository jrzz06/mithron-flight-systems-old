import { describe, expect, it } from "vitest";
import { canAccessAdminSection, isAdminProtectedPath, isAuthPublicPath, sectionFromPath } from "@/lib/auth/access-control";

describe("admin auth route boundaries", () => {
  it("protects only admin and operations control routes, preserving the public storefront", () => {
    expect(isAdminProtectedPath("/admin")).toBe(true);
    expect(isAdminProtectedPath("/admin/products")).toBe(true);
    expect(isAdminProtectedPath("/admin/inventory")).toBe(true);
    expect(isAdminProtectedPath("/warehouse")).toBe(true);
    expect(isAdminProtectedPath("/warehouse/inventory")).toBe(true);
    expect(isAdminProtectedPath("/operations/tasks")).toBe(true);
    expect(isAdminProtectedPath("/operations/deployments")).toBe(true);
    expect(isAdminProtectedPath("/operations/notifications")).toBe(true);
    expect(isAdminProtectedPath("/operations/requests")).toBe(true);

    expect(isAdminProtectedPath("/")).toBe(false);
    expect(isAdminProtectedPath("/agriculture")).toBe(false);
    expect(isAdminProtectedPath("/product/source-agri-kisan-drone-small-8-liter")).toBe(false);
    expect(isAdminProtectedPath("/checkout")).toBe(false);
  });

  it("keeps login and auth callback routes public", () => {
    expect(isAuthPublicPath("/login")).toBe(true);
    expect(isAuthPublicPath("/auth/login")).toBe(true);
    expect(isAuthPublicPath("/auth/callback")).toBe(true);
    expect(isAuthPublicPath("/admin")).toBe(false);
  });

  it("enforces role permissions by admin section", () => {
    expect(canAccessAdminSection("admin", "cms")).toBe(true);
    expect(canAccessAdminSection("admin", "warehouse")).toBe(true);
    expect(canAccessAdminSection("admin", "enquiries")).toBe(true);
    expect(canAccessAdminSection("warehouse", "warehouse")).toBe(true);
    expect(canAccessAdminSection("warehouse", "orders")).toBe(true);
    expect(canAccessAdminSection("warehouse", "cms")).toBe(false);
    expect(canAccessAdminSection("user", "warehouse")).toBe(false);
    expect(canAccessAdminSection("user", "enquiries")).toBe(false);
  });

  it("maps protected routes to the least-privilege permission section", () => {
    expect(sectionFromPath("/admin/settings")).toBe("overview");
    expect(sectionFromPath("/admin/products")).toBe("products");
    expect(sectionFromPath("/admin/inventory")).toBe("warehouse");
    expect(sectionFromPath("/admin/orders")).toBe("orders");
    expect(sectionFromPath("/warehouse/orders")).toBe("warehouse");
    expect(sectionFromPath("/operations/deployments")).toBe("operations");
    expect(sectionFromPath("/operations/notifications")).toBe("operations");
    expect(sectionFromPath("/operations/requests")).toBe("operations");
    expect(sectionFromPath("/operations/tasks")).toBe("tasks");
  });
});
