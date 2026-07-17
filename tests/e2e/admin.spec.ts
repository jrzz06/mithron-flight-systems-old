import { expect, test } from "@playwright/test";
import {
  credentialsSkipMessage,
  expectForbiddenFromAdminShell,
  hasRoleCredentials,
  loginAsRole
} from "./fixtures/auth";

test.describe("Production admin testing", () => {
  test("unauthenticated admin route redirects to login", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/);
  });

  test("admin login lands on operational dashboard", async ({ page }) => {
    test.skip(!hasRoleCredentials("admin"), credentialsSkipMessage("admin"));

    await loginAsRole(page, "admin");
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator("[data-admin-dashboard]")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator("[data-admin-kpi-strip]")).toBeVisible({ timeout: 25_000 });
  });

  test("admin products workspace loads", async ({ page }) => {
    test.skip(!hasRoleCredentials("admin"), credentialsSkipMessage("admin"));

    await loginAsRole(page, "admin", "/admin/products");
    await expect(page.locator("[data-product-search], [data-product-operational-grid]").first()).toBeVisible({ timeout: 25_000 });
  });

  test("admin orders workspace loads", async ({ page }) => {
    test.skip(!hasRoleCredentials("admin"), credentialsSkipMessage("admin"));

    await loginAsRole(page, "admin", "/admin/orders");
    await expect(page.locator("[data-order-status-board], [data-order-filter-form]").first()).toBeVisible({ timeout: 25_000 });
  });

  test("admin supplier approval queue loads", async ({ page }) => {
    test.skip(!hasRoleCredentials("admin"), credentialsSkipMessage("admin"));

    await loginAsRole(page, "admin", "/admin/suppliers/products");
    await expect(page.getByRole("heading", { name: /supplier|approval|pending/i }).first()).toBeVisible({ timeout: 25_000 });
  });

  test("admin CMS route loads", async ({ page }) => {
    test.skip(!hasRoleCredentials("admin"), credentialsSkipMessage("admin"));

    await loginAsRole(page, "admin", "/admin/cms");
    await expect(page.locator("[data-admin-cms-route], [data-cms-home-dashboard]").first()).toBeVisible({ timeout: 25_000 });
  });

  test("admin inventory route loads", async ({ page }) => {
    test.skip(!hasRoleCredentials("admin"), credentialsSkipMessage("admin"));

    await loginAsRole(page, "admin", "/admin/inventory");
    await expect(page.locator("[data-admin-inventory-route]")).toBeVisible({ timeout: 25_000 });
  });

  test("warehouse role is forbidden from admin shell", async ({ page }) => {
    test.skip(!hasRoleCredentials("warehouse"), credentialsSkipMessage("warehouse"));

    await loginAsRole(page, "warehouse");
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expectForbiddenFromAdminShell(page, "warehouse");
  });
});
