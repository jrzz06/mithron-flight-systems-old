import { expect, test } from "@playwright/test";
import {
  credentialsSkipMessage,
  hasRoleCredentials,
  loginAsRole
} from "./fixtures/auth";

test.describe("Production warehouse testing", () => {
  test("warehouse login lands on operational dashboard", async ({ page }) => {
    test.skip(!hasRoleCredentials("warehouse"), credentialsSkipMessage("warehouse"));

    await loginAsRole(page, "warehouse");
    await expect(page).toHaveURL(/\/warehouse\/dashboard/);
    await expect(page.locator("[data-warehouse-operational-dashboard]")).toBeVisible({ timeout: 25_000 });
  });

  test("warehouse fulfillment route loads", async ({ page }) => {
    test.skip(!hasRoleCredentials("warehouse"), credentialsSkipMessage("warehouse"));

    await loginAsRole(page, "warehouse", "/warehouse/fulfillment");
    await expect(page.locator("[data-warehouse-fulfillment-route]")).toBeVisible({ timeout: 25_000 });
  });

  test("warehouse orders route loads order queue", async ({ page }) => {
    test.skip(!hasRoleCredentials("warehouse"), credentialsSkipMessage("warehouse"));

    await loginAsRole(page, "warehouse", "/warehouse/orders");
    await expect(page.locator("[data-warehouse-orders-route]")).toBeVisible({ timeout: 25_000 });
  });

  test("warehouse history route loads", async ({ page }) => {
    test.skip(!hasRoleCredentials("warehouse"), credentialsSkipMessage("warehouse"));

    await loginAsRole(page, "warehouse", "/warehouse/activity");
    await expect(page.locator("[data-warehouse-activity-timeline]")).toBeVisible({ timeout: 25_000 });
  });

  test("supplier role is blocked from warehouse dashboard", async ({ page }) => {
    test.skip(!hasRoleCredentials("supplier"), credentialsSkipMessage("supplier"));

    await loginAsRole(page, "supplier");
    await page.goto("/warehouse/dashboard", { waitUntil: "domcontentloaded" });

    const url = new URL(page.url());
    expect(url.pathname.startsWith("/warehouse/dashboard")).toBe(false);
    expect(url.searchParams.get("access_status") === "forbidden" || url.pathname.startsWith("/supplier")).toBe(true);
  });

  test("admin role is blocked from warehouse dashboard", async ({ page }) => {
    test.skip(!hasRoleCredentials("admin"), credentialsSkipMessage("admin"));

    await loginAsRole(page, "admin");
    await page.goto("/warehouse/dashboard", { waitUntil: "domcontentloaded" });

    const url = new URL(page.url());
    expect(url.pathname.startsWith("/warehouse/dashboard")).toBe(false);
    expect(url.searchParams.get("access_status") === "forbidden" || url.pathname.startsWith("/admin")).toBe(true);
  });
});
