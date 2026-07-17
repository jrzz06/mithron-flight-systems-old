/**
 * Pre-fix responsive overflow probe — customer storefront pages × widths.
 * Usage: node tools/responsive-audit-probe.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3000";
const WIDTHS = [320, 344, 375, 390, 414, 768, 820, 853, 1024, 1180, 1366, 1440];
const PAGES = [
  { id: "homepage", path: "/", ready: '[data-testid="home-hero"]' },
  { id: "listing", path: "/products", ready: "#catalog-grid, [data-catalog-grid], .catalog-product-grid" },
  { id: "category", path: "/category/agri-drones", ready: "#catalog-grid, [data-catalog-grid], .catalog-product-grid" },
  { id: "product-detail", path: "/product/pixy-lr", ready: "[data-product-purchase-panel], [data-testid='product-purchase']" },
  { id: "search", path: "/search", ready: "main" },
  { id: "cart", path: "/cart", ready: "main" },
  { id: "checkout", path: "/checkout", ready: "main" },
  { id: "blog", path: "/blog", ready: "main" },
  { id: "about", path: "/about", ready: "main" },
  { id: "contact", path: "/contact", ready: "main" },
  { id: "login", path: "/login", ready: "main" },
  { id: "account", path: "/account", ready: "main" }
];

const outDir = join(process.cwd(), "tests", "screenshots", "mobile-audit", "_probe");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const defects = [];

for (const pageDef of PAGES) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    try {
      const res = await page.goto(`${BASE}${pageDef.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 45_000
      });
      await page.waitForTimeout(800);
      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        const scrollW = Math.max(doc.scrollWidth, body?.scrollWidth || 0);
        const clientW = doc.clientWidth;
        const overflowX = scrollW > clientW + 1;

        const buttons = [...document.querySelectorAll("button, a.glass-button, [role='button'], .type-button")];
        const smallTouch = buttons
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 8 || r.height < 8) return false;
            if (getComputedStyle(el).display === "none" || getComputedStyle(el).visibility === "hidden") return false;
            return r.height < 44 || (r.width < 44 && r.height >= 20);
          })
          .slice(0, 8)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              tag: el.tagName,
              text: (el.textContent || "").trim().slice(0, 40),
              w: Math.round(r.width),
              h: Math.round(r.height)
            };
          });

        const fab = document.querySelector("[data-assistant-launcher], [data-mithron-ai-launcher], .mithron-assistant-launcher, button[aria-label*='assistant' i], button[aria-label*='Mithron' i]");
        const purchaseBar = document.querySelector(".mobilePurchaseBar, [data-mobile-purchase-bar], [class*='mobilePurchase']");
        let fabOverlap = false;
        if (fab && purchaseBar) {
          const a = fab.getBoundingClientRect();
          const b = purchaseBar.getBoundingClientRect();
          fabOverlap = !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
        }

        return {
          scrollW,
          clientW,
          overflowX,
          smallTouchCount: smallTouch.length,
          smallTouch,
          fabOverlap,
          hasFab: Boolean(fab),
          hasPurchaseBar: Boolean(purchaseBar)
        };
      });

      if (metrics.overflowX) {
        defects.push({
          page: pageDef.id,
          width,
          class: "horizontal-scroll",
          detail: `scrollWidth=${metrics.scrollW} clientWidth=${metrics.clientW}`
        });
      }
      if (width <= 1024 && metrics.smallTouchCount > 0) {
        defects.push({
          page: pageDef.id,
          width,
          class: "touch-target",
          detail: metrics.smallTouch
        });
      }
      if (metrics.fabOverlap) {
        defects.push({
          page: pageDef.id,
          width,
          class: "overlap",
          detail: "FAB overlaps mobile purchase bar"
        });
      }
      if (!res?.ok() && res?.status() !== 307 && res?.status() !== 308) {
        defects.push({
          page: pageDef.id,
          width,
          class: "http",
          detail: `status=${res?.status()}`
        });
      }
      console.log(
        `${pageDef.id}@${width}: overflow=${metrics.overflowX} touchIssues=${metrics.smallTouchCount} fabOverlap=${metrics.fabOverlap} status=${res?.status()}`
      );
    } catch (err) {
      defects.push({ page: pageDef.id, width, class: "error", detail: String(err) });
      console.error(`${pageDef.id}@${width}: ERROR`, err.message || err);
    } finally {
      await context.close();
    }
  }
}

await writeFile(join(outDir, "defects.json"), JSON.stringify(defects, null, 2));
console.log("\n=== DEFECT SUMMARY ===");
console.log(`Total defects: ${defects.length}`);
const byClass = {};
for (const d of defects) {
  byClass[d.class] = (byClass[d.class] || 0) + 1;
}
console.log(byClass);
await browser.close();
process.exit(0);
