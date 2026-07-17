import { expect, test } from "@playwright/test";
import {
  credentialsSkipMessage,
  hasRoleCredentials,
  loginAsRole
} from "./fixtures/auth";

test.describe("Production CMS testing", () => {
  test("homepage CMS surfaces render on storefront", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();

    await expect(page.getByTestId("home-hero")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("home-client-testimonials")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("home-about-band")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("home-about-footer")).toBeVisible({ timeout: 25_000 });
  });

  test("hero copy is populated from CMS read path", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const heroCopy = page.getByTestId("hero-copy").first();
    await expect(heroCopy).toBeVisible({ timeout: 25_000 });
    const text = (await heroCopy.textContent())?.trim() ?? "";
    expect(text.length).toBeGreaterThan(0);
  });

  test("product shelves load live catalog without fallback error", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.getByRole("heading", { name: "Global Product" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: "Global Product" })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("link", { name: /Pixy LR/i }).first()).toBeVisible();
    await expect(page.getByText("Product feed unavailable", { exact: true })).toHaveCount(0);
  });

  test("admin CMS editor loads for authenticated admin", async ({ page }) => {
    test.skip(!hasRoleCredentials("admin"), credentialsSkipMessage("admin"));

    await loginAsRole(page, "admin", "/admin/cms");
    await expect(page.locator("[data-cms-home-dashboard]")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('[data-cms-section-card="hero"]')).toBeVisible({ timeout: 15_000 });

    await page.locator('[data-cms-section-card="hero"] a').filter({ hasText: "Edit" }).click();
    await expect(page.locator("[data-cms-section-editor]")).toBeVisible({ timeout: 15_000 });
  });

  test("admin CMS hero headline matches storefront hero copy", async ({ page }) => {
    test.skip(!hasRoleCredentials("admin"), credentialsSkipMessage("admin"));

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const storefrontHeroText = ((await page.getByTestId("hero-copy").first().textContent()) ?? "").replace(/\s+/g, " ").trim();

    await loginAsRole(page, "admin", "/admin/cms/hero");
    await expect(page.locator("[data-cms-section-editor]")).toBeVisible({ timeout: 25_000 });

    const editorText = await page.locator("[data-cms-section-editor]").innerText();
    if (storefrontHeroText.length > 8) {
      expect(editorText.replace(/\s+/g, " ")).toContain(storefrontHeroText.slice(0, Math.min(24, storefrontHeroText.length)));
    }
  });

  test("admin CMS hero editor exposes multi-slide controls", async ({ page }) => {
    test.skip(!hasRoleCredentials("admin"), credentialsSkipMessage("admin"));

    await loginAsRole(page, "admin", "/admin/cms/hero");
    await expect(page.locator("[data-cms-hero-carousel-editor]")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator("[data-hero-breakpoint-preview]")).toBeVisible();
    await expect(page.locator('input[name="id"]')).toHaveCount(1);
  });

  test("admin shelf editor exposes product slot dropdowns and guide card fields", async ({ page }) => {
    test.skip(!hasRoleCredentials("admin"), credentialsSkipMessage("admin"));

    await loginAsRole(page, "admin", "/admin/cms/shelf-drone-world");
    await expect(page.locator("[data-cms-shelf-product-slots]")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('input[name="product_slugs"]')).toBeVisible();
    await expect(page.locator('input[name="guide_title"]')).toBeVisible();
    await expect(page.locator('input[name="guide_href"]')).toBeVisible();
  });
});
