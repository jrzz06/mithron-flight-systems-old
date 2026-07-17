import { expect, type Locator, type Page } from "@playwright/test";

const CATALOG_PROBE_PATH = "/category/agri-drones";

async function findVisibleCatalogCard(page: Page): Promise<Locator> {
  const cards = page.locator('[data-testid^="premium-product-card-"], [data-card-variant="catalog"]');
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  expect(await cards.count()).toBeGreaterThan(0);

  const count = await cards.count();
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    if (await card.isVisible()) {
      return card;
    }
  }

  return cards.first();
}

export async function openCatalogAndGetFirstProductSlug(page: Page) {
  const response = await page.goto(CATALOG_PROBE_PATH, { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBeTruthy();

  const card = await findVisibleCatalogCard(page);
  await card.scrollIntoViewIfNeeded();

  const testId = await card.getAttribute("data-testid");
  if (testId?.startsWith("premium-product-card-")) {
    return testId.replace("premium-product-card-", "");
  }

  const href = await card.locator("a").first().getAttribute("href");
  expect(href).toMatch(/\/product\//);
  return href!.split("/product/")[1]!.split("?")[0]!;
}

export async function navigateToFirstProductPdp(page: Page) {
  const slug = await openCatalogAndGetFirstProductSlug(page);
  const response = await page.goto(`/product/${slug}`, { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBeTruthy();
  return slug;
}

export async function navigateToKnownProductPdp(page: Page, slug = "pixy-lr") {
  const response = await page.goto(`/product/${slug}`, { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBeTruthy();
  return slug;
}

export async function openCartDrawer(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const cartButton = page.getByRole("button", { name: /open cart/i });
  await cartButton.scrollIntoViewIfNeeded();
  await cartButton.click({ force: true });
  await expect(page.locator(".cart-drawer-root.is-open")).toBeVisible({ timeout: 15_000 });
}

export async function assertCatalogHasVisibleCards(page: Page) {
  const response = await page.goto(CATALOG_PROBE_PATH, { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBeTruthy();
  await findVisibleCatalogCard(page);
}

export async function assertProductsCatalogShell(page: Page) {
  const response = await page.goto("/products", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByTestId("catalog-intro").first()).toBeAttached({ timeout: 25_000 });
  expect(await page.locator('[data-testid^="premium-product-card-"], [data-card-variant="catalog"]').count()).toBeGreaterThan(0);
}
