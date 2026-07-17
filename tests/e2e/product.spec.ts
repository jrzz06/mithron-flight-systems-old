import { expect, test } from "@playwright/test";
import { mutationsEnabled } from "./fixtures/auth";
import {
  assertProductsCatalogShell,
  navigateToFirstProductPdp,
  navigateToKnownProductPdp,
  openCartDrawer,
  openCatalogAndGetFirstProductSlug
} from "./helpers/product";

test.describe("Production product testing", () => {
  test("products catalog shell loads with product inventory", async ({ page }) => {
    await assertProductsCatalogShell(page);
  });

  test("catalog card navigates to product detail page", async ({ page }) => {
    const slug = await openCatalogAndGetFirstProductSlug(page);
    const card = page.locator(`[data-testid="premium-product-card-${slug}"], [data-card-variant='catalog']`).first();
    await card.click();

    await expect(page).toHaveURL(new RegExp(`/product/${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    expect(page.url()).toMatch(/\/product\//);
  });

  test("product detail page shows name, price, and purchase CTA", async ({ page }) => {
    await navigateToKnownProductPdp(page);

    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByText(/₹/).first()).toBeVisible();

    const addToCart = page.getByRole("button", { name: /add.*cart|buy now/i }).first();
    await expect(addToCart).toBeVisible();
  });

  test("homepage product shelves render live catalog cards", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.getByRole("heading", { name: "Global Product" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: "Global Product" })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("link", { name: /Pixy LR/i }).first()).toBeVisible();

    await expect(page.getByText("Product feed unavailable", { exact: true })).toHaveCount(0);
  });

  test("category page loads product grid", async ({ page }) => {
    const response = await page.goto("/category/agri-drones", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();

    const cards = page.locator('[data-testid^="premium-product-card-"], [data-card-variant="catalog"]');
    await expect(cards.first()).toBeVisible({ timeout: 25_000 });
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test("cart drawer opens without server error", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openCartDrawer(page);
    await expect(page.getByText("No drone system selected")).toBeVisible();
  });

  test("catalog search API returns featured products", async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/api/catalog/search`);
    expect(response.ok()).toBeTruthy();

    const payload = await response.json() as { results?: Array<{ slug?: string; name?: string }> };
    expect(Array.isArray(payload.results)).toBe(true);
    expect(payload.results!.length).toBeGreaterThan(0);
    expect(payload.results![0]?.slug).toBeTruthy();
  });

  test("optional cart mutation adds and removes a bundle", async ({ page }) => {
    test.skip(!mutationsEnabled(), "set E2E_ALLOW_MUTATIONS=true to run cart mutation on production");

    const slug = await navigateToFirstProductPdp(page);
    const addButton = page.getByRole("button", { name: /add.*cart|buy now/i }).first();
    await addButton.click({ force: true });

    await openCartDrawer(page);
    await expect(page.locator(".cart-drawer-root.is-open")).toBeVisible();

    const productName = await page.locator("h1").first().textContent();
    if (productName?.trim()) {
      await expect(page.getByText(productName.trim(), { exact: false }).first()).toBeVisible();
    }

    const removeButton = page.getByRole("button", { name: /remove|delete/i }).first();
    if (await removeButton.isVisible()) {
      await removeButton.click();
    }

    await page.goto(`/product/${slug}`, { waitUntil: "domcontentloaded" });
  });
});
