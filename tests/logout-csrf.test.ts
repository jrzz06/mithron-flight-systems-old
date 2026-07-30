import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("logout CSRF protection", () => {
  it("keeps POST logout and guidance-only GET redirects without GET sign-out", () => {
    const route = readFileSync(join(process.cwd(), "app/auth/logout/route.ts"), "utf8");
    expect(route).toContain("export async function POST");
    expect(route).toContain("export async function GET");
    expect(route).toContain("signOut");
    expect(route).toContain("logout_notice");
    expect(route).toContain("SYSTEM_LOGOUT_REASONS");
    expect(route).not.toMatch(/GET[\s\S]*performLogout/);
    expect(route).toContain("createLogoutClient");
  });

  it("sets sameSite cookie options on Supabase server clients", () => {
    const cookieConfig = readFileSync(join(process.cwd(), "lib/supabase/cookie-config.ts"), "utf8");
    expect(cookieConfig).toContain('sameSite: "lax"');
    expect(cookieConfig).toContain("resolveSupabaseCookieOptions");
  });

  it("uses POST forms for account and control panel logout buttons", () => {
    const accountProfile = readFileSync(join(process.cwd(), "app/(storefront)/account/profile/page.tsx"), "utf8");
    const platformNav = readFileSync(join(process.cwd(), "components/platform/platform-nav.tsx"), "utf8");
    const platformTopbar = readFileSync(join(process.cwd(), "components/platform/platform-topbar.tsx"), "utf8");
    const profileNav = readFileSync(join(process.cwd(), "components/navigation/profile-nav-button.tsx"), "utf8");
    const logoutForm = readFileSync(join(process.cwd(), "components/auth/logout-form.tsx"), "utf8");
    const logoutBridge = readFileSync(
      join(process.cwd(), "components/notifications/logout-notice-toast-bridge.tsx"),
      "utf8"
    );
    const clearBrowserSession = readFileSync(join(process.cwd(), "lib/auth/clear-browser-session.ts"), "utf8");
    const warehouseLayout = readFileSync(join(process.cwd(), "app/warehouse/layout.tsx"), "utf8");
    const supplierLayout = readFileSync(join(process.cwd(), "app/supplier/layout.tsx"), "utf8");

    expect(accountProfile).toContain("LogoutForm");
    expect(logoutForm).toContain('"/auth/logout"');
    expect(logoutForm).toContain("clearBrowserAuthSession");
    expect(logoutForm).toContain('method="post"');
    expect(logoutForm).not.toContain("firebaseSignOut");
    expect(accountProfile).not.toContain('href="/auth/logout"');
    expect(platformNav).toContain("LogoutForm");
    expect(platformTopbar).toContain("LogoutForm");
    expect(profileNav).toContain("LogoutForm");
    expect(logoutBridge).toContain("clearBrowserAuthSession");
    expect(clearBrowserSession).toContain('scope: "local"');
    expect(warehouseLayout).toContain("ControlPlaneParallelLayout");
    expect(warehouseLayout).toContain("data-warehouse-frame");
    expect(supplierLayout).toContain("ControlPlaneParallelLayout");
    expect(supplierLayout).toContain("data-supplier-frame");
  });
});
