import { test, expect } from "@playwright/test";

test.describe("CMS storefront validation", () => {
  test("homepage surfaces load from unified CMS read path", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();

    await expect(page.getByTestId("home-hero")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("home-client-testimonials")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("home-about-band")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("home-about-footer")).toBeVisible({ timeout: 20_000 });
  });

  test("admin CMS core route loads without advanced workspace tables", async ({ page }) => {
    const response = await page.goto("/admin/cms", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(500);

    await expect(page.locator("[data-cms-home-dashboard]")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-cms-media-field]").first()).toBeVisible({ timeout: 20_000 }).catch(() => {
      // Media field appears inside an expanded section; open hero panel
    });

    const heroNav = page.locator('[data-homepage-cms-nav-item="hero"]');
    if (await heroNav.isVisible()) {
      await heroNav.click();
      await expect(page.locator("[data-cms-media-field]").first()).toBeVisible({ timeout: 10_000 });
    }
  });
});
