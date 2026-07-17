import { test, expect } from "@playwright/test";

test.describe("storefront performance smoke", () => {
  test("home route becomes interactive quickly", async ({ page }) => {
    const started = Date.now();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("navigation")).toBeVisible();
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  test("products route exposes catalog content without full-page spinner lock", async ({ page }) => {
    await page.goto("/products", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
  });

  test("search overlay opens with responsive panel", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const searchButton = page.getByRole("button", { name: /search/i }).first();
    await searchButton.click();
    await expect(page.getByRole("dialog", { name: /search catalog/i })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: /search mithron systems/i })).toBeVisible();
  });

  test("add to cart gives immediate drawer feedback on product page", async ({ page }) => {
    await page.goto("/products", { waitUntil: "domcontentloaded" });
    const productLink = page.locator('a[href^="/product/"]').first();
    await productLink.click();
    await page.waitForURL(/\/product\//);

    const addToCart = page.getByRole("button", { name: /add to cart/i }).first();
    await expect(addToCart).toBeVisible();
    const clickStarted = Date.now();
    await addToCart.click();
    await expect(page.getByRole("dialog", { name: /cart/i })).toBeVisible({ timeout: 3000 });
    expect(Date.now() - clickStarted).toBeLessThan(2500);
  });
});
