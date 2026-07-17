import { defineConfig, devices } from "@playwright/test";

const productionBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "https://final-mithron-deploy.vercel.app";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: [
    "product.spec.ts",
    "seo.spec.ts",
    "images.spec.ts",
    "cms.spec.ts",
    "admin.spec.ts",
    "warehouse.spec.ts",
    "supplier.spec.ts"
  ],
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  expect: {
    timeout: 15_000
  },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-production" }]],
  use: {
    baseURL: productionBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 } }
    }
  ]
});
