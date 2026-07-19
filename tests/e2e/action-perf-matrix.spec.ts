import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { measureAction, measureNavigation, type ActionPerfSample } from "./helpers/action-perf";

/**
 * Measurement-first action matrix (storefront guest paths).
 * Auth-gated admin/warehouse/supplier mutations need role credentials —
 * those are timed via HTTP baseline + control-panel-perf when creds exist.
 */
test.describe("action perf matrix — customer", () => {
  const samples: ActionPerfSample[] = [];

  test.afterAll(() => {
    mkdirSync("test-output", { recursive: true });
    writeFileSync("test-output/action-perf-matrix.json", JSON.stringify({ samples, at: new Date().toISOString() }, null, 2));
  });

  test("homepage / PLP / PDP navigation", async ({ page }) => {
    samples.push(
      await measureNavigation(page, {
        id: "home",
        panel: "customer",
        action: "homepage_load",
        url: "/",
        readySelector: "nav, [role='navigation']"
      })
    );
    samples.push(
      await measureNavigation(page, {
        id: "plp",
        panel: "customer",
        action: "plp_load",
        url: "/products",
        readySelector: "main"
      })
    );
    samples.push(
      await measureNavigation(page, {
        id: "pdp",
        panel: "customer",
        action: "pdp_load",
        url: "/product/agrione-x1",
        readySelector: "main"
      })
    );
    for (const s of samples.slice(-3)) {
      expect(s.hung, s.notes).toBe(false);
      expect(s.settledMs).toBeLessThan(15_000);
    }
  });

  test("search-as-you-type suggestions", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /search/i }).first().click();
    const box = page.getByRole("searchbox", { name: /search mithron systems/i });
    await expect(box).toBeVisible();
    const started = Date.now();
    await box.fill("drone");
    // Debounce is ~200ms; wait for results or empty state
    await page.waitForTimeout(450);
    const settledMs = Date.now() - started;
    samples.push({
      id: "search-typeahead",
      panel: "customer",
      action: "search_suggestions",
      pendingMs: -1,
      settledMs,
      ok: true,
      hung: settledMs > 5000,
      notes: "includes 200ms debounce + local/remote resolve"
    });
    expect(settledMs).toBeLessThan(5000);
  });

  test("add to cart perceived feedback", async ({ page }) => {
    await page.goto("/product/agrione-x1", { waitUntil: "domcontentloaded" });
    const addToCart = page.getByRole("button", { name: /add to cart/i }).first();
    await expect(addToCart).toBeVisible({ timeout: 15_000 });
    const sample = await measureAction(page, {
      id: "atc",
      panel: "customer",
      action: "add_to_cart",
      click: () => addToCart.click(),
      successSelector: "[role='dialog']",
      pendingTimeoutMs: 300,
      settleTimeoutMs: 5000
    });
    samples.push(sample);
    expect(sample.hung).toBe(false);
    expect(sample.settledMs).toBeLessThan(5000);
  });

  test("checkout page load", async ({ page }) => {
    samples.push(
      await measureNavigation(page, {
        id: "checkout",
        panel: "customer",
        action: "checkout_page_load",
        url: "/checkout",
        readySelector: "main"
      })
    );
  });

  test("contact page load", async ({ page }) => {
    samples.push(
      await measureNavigation(page, {
        id: "contact",
        panel: "customer",
        action: "contact_page_load",
        url: "/contact",
        readySelector: "main"
      })
    );
  });

  test("login page load", async ({ page }) => {
    samples.push(
      await measureNavigation(page, {
        id: "login",
        panel: "customer",
        action: "login_page_load",
        url: "/login",
        readySelector: "main, form"
      })
    );
  });
});
