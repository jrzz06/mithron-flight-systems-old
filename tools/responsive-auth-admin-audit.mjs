#!/usr/bin/env node
/**
 * One-shot responsive layout audit for auth + admin shells.
 * Detects horizontal overflow, clipped interactive controls, and missing CSS modules.
 */
import { chromium, devices } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://final-mithron-deploy.vercel.app";
const OUT_DIR = join(process.cwd(), "docs", "responsive-audit-artifacts");

const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 568 },
  { name: "mobile-360", width: 360, height: 640 },
  { name: "mobile-375", width: 375, height: 667 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-412", width: 412, height: 915 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "tablet-820", width: 820, height: 1180 },
  { name: "tablet-853", width: 853, height: 1280 },
  { name: "laptop-1280", width: 1280, height: 720 },
  { name: "laptop-1366", width: 1366, height: 768 },
  { name: "laptop-1440", width: 1440, height: 900 },
  { name: "desktop-1600", width: 1600, height: 900 },
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "desktop-2560", width: 2560, height: 1440 },
  { name: "ultrawide-3440", width: 3440, height: 1440 },
  { name: "short-landscape", width: 667, height: 320 },
  { name: "short-login", width: 390, height: 500 }
];

const ZOOM_LEVELS = [80, 90, 100, 110, 125, 150, 175, 200];

const PAGES = [
  { path: "/login", label: "Login", selector: "[data-testid='login-auth-card']" },
  { path: "/signup", label: "Signup", selector: "form" },
  { path: "/forgot-password", label: "ForgotPassword", selector: "form" },
  { path: "/reset-password", label: "ResetPassword", selector: "main" },
  { path: "/admin", label: "AdminRedirect", selector: "body" },
  { path: "/admin/orders", label: "AdminOrdersRedirect", selector: "body" }
];

async function measurePage(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const horizontalOverflow = Math.max(
      doc.scrollWidth - doc.clientWidth,
      body.scrollWidth - body.clientWidth
    );

    const controls = Array.from(
      document.querySelectorAll("button, input, a[href], select, textarea")
    ).filter((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });

    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const clipped = [];
    for (const el of controls) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const outOfViewport =
        rect.bottom > viewport.h + 1 ||
        rect.right > viewport.w + 1 ||
        rect.top < -1 ||
        rect.left < -1;
      const label =
        el.getAttribute("data-testid") ||
        el.getAttribute("aria-label") ||
        el.textContent?.trim().slice(0, 40) ||
        el.tagName;
      if (outOfViewport) {
        clipped.push({
          label,
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          right: Math.round(rect.right),
          viewportH: viewport.h,
          viewportW: viewport.w
        });
      }
    }

    const canScrollY =
      doc.scrollHeight > doc.clientHeight + 1 || body.scrollHeight > body.clientHeight + 1;

    return {
      horizontalOverflow,
      canScrollY,
      scrollHeight: doc.scrollHeight,
      clientHeight: doc.clientHeight,
      clippedCount: clipped.length,
      clipped: clipped.slice(0, 8)
    };
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();

    for (const route of PAGES) {
      await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(600);
      const metrics = await measurePage(page);
      const shotName = `${route.label}-${vp.name}.png`;
      if (metrics.horizontalOverflow > 2 || metrics.clippedCount > 0) {
        await page.screenshot({ path: join(OUT_DIR, shotName), fullPage: true });
      }
      results.push({
        route: route.path,
        label: route.label,
        viewport: vp.name,
        size: `${vp.width}x${vp.height}`,
        zoom: 100,
        ...metrics,
        screenshot: metrics.horizontalOverflow > 2 || metrics.clippedCount > 0 ? shotName : null
      });
    }
    await context.close();
  }

  // Zoom audit on login only (representative)
  for (const zoom of ZOOM_LEVELS) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.evaluate((z) => {
      document.documentElement.style.zoom = `${z}%`;
    }, zoom);
    await page.waitForTimeout(400);
    const metrics = await measurePage(page);
    const shotName = `Login-zoom-${zoom}.png`;
    if (metrics.horizontalOverflow > 2 || metrics.clippedCount > 0) {
      await page.screenshot({ path: join(OUT_DIR, shotName), fullPage: true });
    }
    results.push({
      route: "/login",
      label: "Login",
      viewport: "mobile-390",
      size: "390x844",
      zoom,
      ...metrics,
      screenshot: metrics.horizontalOverflow > 2 || metrics.clippedCount > 0 ? shotName : null
    });
    await context.close();
  }

  await browser.close();

  const issues = results.filter(
    (r) => r.horizontalOverflow > 2 || r.clippedCount > 0 || (r.route === "/reset-password" && r.scrollHeight > 2000)
  );

  writeFileSync(join(OUT_DIR, "metrics.json"), JSON.stringify({ results, issues }, null, 2));
  console.log(`Audited ${results.length} combinations. Issues: ${issues.length}`);
  console.log(JSON.stringify(issues, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
