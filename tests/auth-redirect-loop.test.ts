import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldConfineRoleToControlPanel } from "@/lib/auth/access-control";
import {
  buildLoginRedirectPath,
  buildProfileCompletionRedirectPath,
  resolveIntendedAuthNext,
  unwrapAuthNextPath
} from "@/lib/auth/redirects";

describe("auth redirect loop prevention", () => {
  it("unwraps nested next chains to a single clean destination", () => {
    expect(
      unwrapAuthNextPath("/admin?next=/admin?next=/login?next=/account/complete-profile", "/")
    ).toBe("/admin");

    expect(
      unwrapAuthNextPath("/login?next=%2Fadmin%3Fnext%3D%2Fadmin", "/")
    ).toBe("/admin");

    expect(
      unwrapAuthNextPath("/account/complete-profile?next=%2Fadmin", "/")
    ).toBe("/admin");
  });

  it("never nests next when one already exists on the request", () => {
    const params = new URLSearchParams("next=%2Fadmin&access_status=control_panel_only");
    expect(resolveIntendedAuthNext("/account/complete-profile", params, "/")).toBe("/admin");
    expect(resolveIntendedAuthNext("/login", params, "/")).toBe("/admin");

    const adminParams = new URLSearchParams("next=%2Fadmin%3Fnext%3D%2Flogin");
    expect(resolveIntendedAuthNext("/admin", adminParams, "/")).toBe("/admin");
  });

  it("builds login and profile completion URLs with a single next value", () => {
    expect(buildLoginRedirectPath("/admin?next=/admin")).toBe("/login?next=%2Fadmin");
    expect(buildProfileCompletionRedirectPath("/login?next=/admin")).toBe(
      "/account/complete-profile?next=%2Fadmin"
    );
    expect(buildLoginRedirectPath("/account/complete-profile?next=/admin")).toBe(
      "/login?next=%2Fadmin"
    );
  });

  it("does not confine staff away from profile completion", () => {
    expect(shouldConfineRoleToControlPanel("admin", "/account/complete-profile")).toBe(false);
    expect(shouldConfineRoleToControlPanel("warehouse", "/account/complete-profile")).toBe(false);
    expect(shouldConfineRoleToControlPanel("supplier", "/account/complete-profile")).toBe(false);
  });

  it("wires proxy redirects through the shared helpers", () => {
    const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    expect(proxy).toContain("resolveIntendedAuthNext");
    expect(proxy).toContain("buildLoginRedirectPath");
    expect(proxy).toContain("buildProfileCompletionRedirectPath");
    expect(proxy).toContain("redirectToRoleHome");
    expect(proxy).not.toContain('searchParams.set("next", `${pathname}${request.nextUrl.search}`)');
  });
});
