import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ADMIN_PAGES = [
  "/admin/products",
  "/admin/inventory",
  "/admin/orders",
  "/admin/suppliers",
  "/admin/reviews",
  "/admin/enquiries",
  "/admin/cms",
  "/admin/blog",
  "/admin/warehouses"
];

const SEARCH_PAGES = [
  { path: "/admin/reviews?q=test", label: "reviews-search" },
  { path: "/admin/blog?q=test", label: "blog-search" },
  { path: "/admin/enquiries?q=test", label: "enquiries-search" }
];

function readAdminCredentials() {
  const email = process.env.E2E_ADMIN_EMAIL?.trim() ?? "";
  const password = process.env.E2E_ADMIN_PASSWORD?.trim() ?? "";
  if (!email || !password) return null;
  return { email, password };
}

async function login(page, credentials, baseUrl) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"], input[type="email"]', credentials.email);
  await page.fill('input[name="password"], input[type="password"]', credentials.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 60_000 });
}

function summarizeRequests(requests) {
  const apiRequests = requests.filter((entry) => entry.url.includes("/api/") || entry.url.includes("/_next/data/"));
  const uniqueUrls = [...new Set(apiRequests.map((entry) => entry.url.split("?")[0]))];
  const totalBytes = apiRequests.reduce((sum, entry) => sum + (entry.transferSize ?? 0), 0);
  return {
    totalRequests: requests.length,
    apiLikeRequests: apiRequests.length,
    uniqueApiUrls: uniqueUrls.length,
    transferBytes: totalBytes
  };
}

async function measurePage(page, baseUrl, path) {
  const requests = [];
  const listener = (request) => {
    requests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType()
    });
  };

  page.on("request", listener);
  const started = Date.now();
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle", timeout: 120_000 });
  const loadMs = Date.now() - started;
  page.off("request", listener);

  const navigationTiming = await page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0];
    return entry
      ? {
          domContentLoaded: Math.round(entry.domContentLoadedEventEnd),
          loadEvent: Math.round(entry.loadEventEnd)
        }
      : null;
  });

  return {
    path,
    loadMs,
    navigationTiming,
    ...summarizeRequests(requests)
  };
}

async function main() {
  const baseUrl = process.env.ADMIN_PERF_BASE_URL?.trim() || "http://127.0.0.1:3000";
  const credentials = readAdminCredentials();
  if (!credentials) {
    console.error("Missing E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await login(page, credentials, baseUrl);

  const pageSamples = [];
  for (const path of ADMIN_PAGES) {
    pageSamples.push(await measurePage(page, baseUrl, path));
  }

  const searchSamples = [];
  for (const entry of SEARCH_PAGES) {
    searchSamples.push({ label: entry.label, ...(await measurePage(page, baseUrl, entry.path)) });
  }

  await browser.close();

  const report = {
    capturedAt: new Date().toISOString(),
    baseUrl,
    pageSamples,
    searchSamples
  };

  mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
  const outputPath = join(process.cwd(), "test-output", "admin-panel-perf-audit.json");
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`[admin-panel-perf-audit] wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
