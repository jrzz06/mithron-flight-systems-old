import { expect, test } from "@playwright/test";
import {
  credentialsSkipMessage,
  hasRoleCredentials,
  loginAsRole,
  mutationsEnabled
} from "./fixtures/auth";

test.describe("Production supplier testing", () => {
  test("supplier login lands on supplier overview", async ({ page }) => {
    test.skip(!hasRoleCredentials("supplier"), credentialsSkipMessage("supplier"));

    await loginAsRole(page, "supplier");
    await expect(page).toHaveURL(/\/supplier/);
    await expect(page.locator("[data-supplier-frame]")).toBeVisible({ timeout: 25_000 });
  });

  test("supplier products list loads", async ({ page }) => {
    test.skip(!hasRoleCredentials("supplier"), credentialsSkipMessage("supplier"));

    await loginAsRole(page, "supplier", "/supplier/products");
    await expect(page.getByRole("heading", { name: "My products" })).toBeVisible({ timeout: 25_000 });
  });

  test("supplier new product form exposes validation feedback", async ({ page }) => {
    test.skip(!hasRoleCredentials("supplier"), credentialsSkipMessage("supplier"));

    await loginAsRole(page, "supplier", "/supplier/products/new");
    await expect(page.locator("[data-supplier-product-create-form]")).toBeVisible({ timeout: 25_000 });

    await page.locator("[data-supplier-product-create-form] button[type='submit']").click();
    await expect(page.locator('[data-supplier-product-create-feedback="validation"]')).toBeVisible({ timeout: 10_000 });
  });

  test("supplier inventory page loads", async ({ page }) => {
    test.skip(!hasRoleCredentials("supplier"), credentialsSkipMessage("supplier"));

    await loginAsRole(page, "supplier", "/supplier/inventory");
    await expect(page.getByRole("heading", { name: "Supplier inventory" })).toBeVisible({ timeout: 25_000 });
  });

  test("warehouse role is blocked from supplier products", async ({ page }) => {
    test.skip(!hasRoleCredentials("warehouse"), credentialsSkipMessage("warehouse"));

    await loginAsRole(page, "warehouse");
    await page.goto("/supplier/products", { waitUntil: "domcontentloaded" });

    const url = new URL(page.url());
    expect(url.pathname.startsWith("/supplier/products")).toBe(false);
    expect(url.searchParams.get("access_status") === "forbidden" || url.pathname.startsWith("/warehouse")).toBe(true);
  });

  test("pending review products are not editable when present", async ({ page }) => {
    test.skip(!hasRoleCredentials("supplier"), credentialsSkipMessage("supplier"));

    await loginAsRole(page, "supplier", "/supplier/products");
    const pendingRow = page.getByText("Waiting for admin approval.").first();
    if (!(await pendingRow.isVisible())) {
      test.skip(true, "no pending_review supplier products in production account");
    }

    const editLink = page.getByRole("link", { name: /edit/i }).first();
    await expect(editLink).toHaveCount(0);
  });

  test("optional supplier draft mutation is gated", async ({ page }) => {
    test.skip(!mutationsEnabled(), "set E2E_ALLOW_MUTATIONS=true to run supplier draft mutation on production");
    test.skip(!hasRoleCredentials("supplier"), credentialsSkipMessage("supplier"));

    await loginAsRole(page, "supplier", "/supplier/products/new");
    const uniqueSlug = `e2e-test-${Date.now()}`;

    await page.locator("[data-supplier-product-create-form] input[name='slug']").fill(uniqueSlug);
    await page.locator("[data-supplier-product-create-form] input[name='name']").fill(`E2E Test ${uniqueSlug}`);
    await page.locator("[data-supplier-product-create-form] input[name='price']").fill("1000");
    await page.locator("[data-supplier-product-create-form] button[type='submit']").click();

    await expect(page.getByText(/saved|draft/i).first()).toBeVisible({ timeout: 30_000 });
  });
});
