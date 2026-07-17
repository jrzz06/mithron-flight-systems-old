import { expect, test } from "@playwright/test";
import {
  assertImageRevealOnPage,
  assertNoWixInImageLocator,
  assertProductMediaDelivery,
  waitForImageLoaded
} from "./helpers/images";
import { assertCatalogHasVisibleCards, navigateToKnownProductPdp } from "./helpers/product";

test.describe("Production image testing", () => {
  test("homepage hero image uses canonical asset delivery", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const heroImage = page.getByTestId("home-hero").locator("img").first();
    await expect(heroImage).toBeVisible({ timeout: 25_000 });

    const src = await heroImage.getAttribute("src");
    expect(src).toMatch(/(_next\/image\?url=|\/assets\/hero\/|supabase\.co\/storage\/v1\/object\/public\/mithron-hero)/);
    await assertNoWixInImageLocator(heroImage);
  });

  test("catalog cards avoid Wix CDN sources", async ({ page }) => {
    await page.goto("/products", { waitUntil: "domcontentloaded" });
    await assertCatalogHasVisibleCards(page);

    const images = page.locator('[data-testid^="premium-product-card-"] img, [data-card-variant="catalog"] img');
    await images.first().scrollIntoViewIfNeeded();

    const sampleSize = Math.min(await images.count(), 6);
    for (let index = 0; index < sampleSize; index += 1) {
      await assertNoWixInImageLocator(images.nth(index));
    }
  });

  test("product detail media uses responsive delivery", async ({ page }) => {
    await navigateToKnownProductPdp(page);
    await assertProductMediaDelivery(page);
  });

  test("responsive images reveal after load", async ({ page }) => {
    await page.goto("/product/pixy-lr", { waitUntil: "domcontentloaded" });
    const firstImage = page.locator("[data-image-reveal], .mithron-responsive-image").first();
    await waitForImageLoaded(firstImage);
    await assertImageRevealOnPage(page);
  });

  test("homepage shelf product images load successfully", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const productLink = page.getByRole("link", { name: /Pixy LR/i }).first();
    await productLink.scrollIntoViewIfNeeded();
    await expect(productLink).toBeVisible({ timeout: 25_000 });

    const image = productLink.locator("img").first();
    await waitForImageLoaded(image);
  });

  test("non-hero catalog images use lazy loading", async ({ page }) => {
    await page.goto("/products", { waitUntil: "domcontentloaded" });
    await assertCatalogHasVisibleCards(page);

    const images = page.locator('[data-testid^="premium-product-card-"] img, [data-card-variant="catalog"] img');
    await images.first().scrollIntoViewIfNeeded();

    const loading = await images.first().getAttribute("loading");
    expect(loading === "lazy" || loading === null).toBe(true);
  });
});
