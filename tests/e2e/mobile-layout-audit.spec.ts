import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { navigateToKnownProductPdp } from "./helpers/product";

const AUDIT_WIDTHS = [320, 360, 390, 430, 480, 600, 768, 820, 900, 1024, 1100, 1280, 1366, 1440] as const;
const SCREENSHOT_WIDTHS = [344, 390, 820, 1024] as const;
const DESKTOP_WIDTHS = [1280, 1440] as const;
const SCREENSHOT_ROOT = join(process.cwd(), "tests", "screenshots", "mobile-audit");

type AuditPage = {
  id: string;
  path: string;
  readySelector: string;
  usePdpHelper?: boolean;
};

const PAGES: AuditPage[] = [
  { id: "homepage", path: "/", readySelector: '[data-testid="home-hero"]' },
  { id: "listing", path: "/products", readySelector: "#catalog-grid, .catalog-product-grid" },
  { id: "category", path: "/category/agri-drones", readySelector: "#catalog-grid, .catalog-product-grid" },
  {
    id: "product-detail",
    path: "/product/pixy-lr",
    readySelector: "[data-product-purchase-panel]",
    usePdpHelper: true
  },
  { id: "search", path: "/search", readySelector: "main" },
  { id: "cart", path: "/cart", readySelector: "main" },
  { id: "checkout", path: "/checkout", readySelector: "main" },
  { id: "blog", path: "/blog", readySelector: "main" },
  { id: "about", path: "/about", readySelector: "main" },
  { id: "contact", path: "/contact", readySelector: "main" },
  { id: "login", path: "/login", readySelector: '[data-testid="login-guest-account"], main' },
  { id: "account", path: "/account", readySelector: "main" }
];

async function gotoAuditPage(page: import("@playwright/test").Page, auditPage: AuditPage) {
  if (auditPage.usePdpHelper) {
    await navigateToKnownProductPdp(page, "pixy-lr");
    return;
  }

  const response = await page.goto(auditPage.path, { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBeTruthy();
}

async function assertNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollW = Math.max(doc.scrollWidth, body?.scrollWidth ?? 0);
    const clientW = doc.clientWidth;
    return { scrollW, clientW, overflowX: scrollW > clientW + 2 };
  });

  expect(metrics.overflowX, `scrollWidth=${metrics.scrollW} clientWidth=${metrics.clientW}`).toBeFalsy();
}

async function capturePage(
  page: import("@playwright/test").Page,
  auditPage: AuditPage,
  width: number,
  label: "after"
) {
  await page.setViewportSize({ width, height: 900 });
  await gotoAuditPage(page, auditPage);
  await expect(page.locator(auditPage.readySelector).first()).toBeVisible({ timeout: 30_000 });
  await assertNoHorizontalOverflow(page);

  const outputDir = join(SCREENSHOT_ROOT, auditPage.id);
  await mkdir(outputDir, { recursive: true });
  await page.screenshot({
    path: join(outputDir, `${width}-${label}.png`),
    fullPage: true
  });
}

test.describe("storefront responsive layout audit", () => {
  for (const auditPage of PAGES) {
    for (const width of AUDIT_WIDTHS) {
      test(`${auditPage.id} has no horizontal overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await gotoAuditPage(page, auditPage);
        await expect(page.locator(auditPage.readySelector).first()).toBeVisible({ timeout: 30_000 });
        await assertNoHorizontalOverflow(page);
      });
    }
  }

  for (const auditPage of PAGES) {
    for (const width of SCREENSHOT_WIDTHS) {
      test(`screenshot ${auditPage.id} at ${width}px`, async ({ page }) => {
        await capturePage(page, auditPage, width, "after");
      });
    }
  }

  for (const auditPage of PAGES.filter((entry) => entry.id !== "category")) {
    for (const width of DESKTOP_WIDTHS) {
      test(`desktop regression ${auditPage.id} at ${width}px`, async ({ page }) => {
        await gotoAuditPage(page, auditPage);
        await page.setViewportSize({ width, height: 1100 });
        await expect(page.locator(auditPage.readySelector).first()).toBeVisible({ timeout: 30_000 });
        await assertNoHorizontalOverflow(page);

        const outputDir = join(SCREENSHOT_ROOT, "desktop", auditPage.id);
        await mkdir(outputDir, { recursive: true });
        await page.screenshot({
          path: join(outputDir, `${width}-after.png`),
          fullPage: true
        });
      });
    }
  }
});
