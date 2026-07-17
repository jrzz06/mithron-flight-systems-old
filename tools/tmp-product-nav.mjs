import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3000/product/4k-cinema-drone", { waitUntil: "domcontentloaded", timeout: 120000 }).catch(async () => {
  await page.goto("http://localhost:3000/products", { waitUntil: "domcontentloaded", timeout: 120000 });
  const href = await page.evaluate(() => document.querySelector('a[href*="/product/"]')?.getAttribute("href"));
  if (href) await page.goto("http://localhost:3000" + href, { waitUntil: "domcontentloaded", timeout: 120000 });
});
await page.waitForTimeout(2000);
const report = await page.evaluate(() => {
  const cs = (el) => el ? getComputedStyle(el) : null;
  const topbar = document.querySelector(".mithron-topbar");
  const bar = document.querySelector(".adaptive-navbar__bar");
  const link = document.querySelector(".adaptive-navbar__link");
  const brand = document.querySelector(".mithron-topbar__brand");
  const announce = document.querySelector(".mithron-topbar__announcement");
  return {
    url: location.pathname,
    ink: document.documentElement.getAttribute("data-nav-ink"),
    hydrated: document.documentElement.hasAttribute("data-nav-ink-hydrated"),
    offline: Boolean(document.querySelector("[data-storefront-offline-banner]")),
    online: navigator.onLine,
    topbar: topbar ? { bg: cs(topbar).backgroundColor, color: cs(topbar).color, ink: cs(topbar).getPropertyValue("--topbar-ink"), muted: cs(topbar).getPropertyValue("--topbar-muted") } : null,
    brand: brand ? { color: cs(brand).color, opacity: cs(brand).opacity } : null,
    announce: announce ? { color: cs(announce).color, opacity: cs(announce).opacity } : null,
    bar: bar ? { bg: cs(bar).backgroundColor, color: cs(bar).color, position: cs(bar).position } : null,
    link: link ? { color: cs(link).color, opacity: cs(link).opacity } : null,
    hasShowcase: Boolean(document.querySelector(".catalog-hero-section--showcase, .home-page-canvas")),
    navInkVar: document.documentElement.style.getPropertyValue("--adaptive-navbar-ink") || getComputedStyle(document.documentElement).getPropertyValue("--adaptive-navbar-ink")
  };
});
console.log(JSON.stringify(report, null, 2));
await page.screenshot({ path: "reports/product-nav.png", clip: { x:0, y:0, width:1440, height:180 } });
await browser.close();
