import { expect, type Locator, type Page } from "@playwright/test";

const WIX_PATTERN = /wixstatic\.com/i;

export async function assertNoWixInImageLocator(image: Locator) {
  const src = (await image.getAttribute("src")) ?? "";
  const srcset = (await image.getAttribute("srcset")) ?? "";
  expect(src).not.toMatch(WIX_PATTERN);
  expect(srcset).not.toMatch(WIX_PATTERN);
}

export async function waitForImageLoaded(image: Locator) {
  await expect(image).toBeVisible();
  await image.evaluate((img: HTMLImageElement) => {
    if (img.complete && img.naturalWidth > 0) return;
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Image load timeout")), 20_000);
      img.addEventListener("load", () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
      img.addEventListener("error", () => {
        window.clearTimeout(timeout);
        reject(new Error("Image failed to load"));
      }, { once: true });
    });
  });
  const naturalWidth = await image.evaluate((img: HTMLImageElement) => img.naturalWidth);
  expect(naturalWidth).toBeGreaterThan(0);
}

export async function assertImageRevealOnPage(page: Page, selector = "[data-image-reveal]") {
  const revealed = page.locator(`${selector}[data-image-reveal="revealed"], ${selector}.is-revealed`).first();
  await expect(revealed).toBeVisible({ timeout: 25_000 });
}

export async function assertProductMediaDelivery(page: Page) {
  const picture = page.locator("picture").first();
  if (await picture.count() > 0 && await picture.isVisible().catch(() => false)) {
    await waitForImageLoaded(picture.locator("img").first());
    const src = (await picture.locator("img").first().getAttribute("src")) ?? "";
    expect(src).toMatch(/supabase\.co|_next\/image|\/assets\/|\/media\//);
    return;
  }

  const image = page.locator("[data-media-viewer] img").first();
  if (await image.count() === 0 || !(await image.isVisible().catch(() => false))) {
    const fallback = page.locator("main img").first();
    await waitForImageLoaded(fallback);
    const src = (await fallback.getAttribute("src")) ?? "";
    expect(src).toMatch(/supabase\.co|_next\/image|\/assets\/|\/media\//);
    return;
  }

  await waitForImageLoaded(image);
  const src = (await image.getAttribute("src")) ?? "";
  expect(src).toMatch(/supabase\.co|_next\/image|\/assets\/|\/media\//);
}
