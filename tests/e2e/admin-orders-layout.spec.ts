import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  credentialsSkipMessage,
  hasRoleCredentials
} from "./fixtures/auth";

/**
 * Admin Orders master-detail layout resilience across aspect ratios / breakpoints.
 * Asserts zero overlap between actions rail controls and detail content panels,
 * and that list order IDs are not squeezed to "OR…".
 */

type Box = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  label: string;
};

type ViewportCase = {
  id: string;
  width: number;
  height: number;
  /** Expect master list + detail side-by-side (xl+) */
  expectSplit?: boolean;
  /** Expect dedicated third actions column (2xl+) */
  expectActionsColumn?: boolean;
};

const VIEWPORTS: ViewportCase[] = [
  { id: "ultrawide-21x9", width: 2560, height: 1080, expectSplit: true, expectActionsColumn: true },
  { id: "desktop-16x9", width: 1920, height: 1080, expectSplit: true, expectActionsColumn: true },
  { id: "laptop-16x10-1440", width: 1440, height: 900, expectSplit: true, expectActionsColumn: false },
  { id: "laptop-16x10-1280", width: 1280, height: 800, expectSplit: true, expectActionsColumn: false },
  { id: "tablet-landscape", width: 1024, height: 768, expectSplit: false },
  { id: "tablet-portrait", width: 768, height: 1024, expectSplit: false },
  { id: "mobile-9x16", width: 390, height: 844, expectSplit: false }
];

const SCREENSHOT_ROOT = join(process.cwd(), "tests", "screenshots", "admin-orders-layout");

function boxesOverlap(a: Box, b: Box, pad = 1): boolean {
  return (
    a.right > b.left + pad &&
    a.left < b.right - pad &&
    a.bottom > b.top + pad &&
    a.top < b.bottom - pad
  );
}

async function collectBoxes(page: Page, selectors: Array<{ selector: string; label: string }>): Promise<Box[]> {
  return page.evaluate((items) => {
    const out: Box[] = [];
    for (const item of items) {
      for (const node of Array.from(document.querySelectorAll<HTMLElement>(item.selector))) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
          continue;
        }
        // Skip nodes inside a display:none ancestor (duplicate stacked/2xl rails).
        let ancestor: HTMLElement | null = node.parentElement;
        let clipped = false;
        while (ancestor) {
          const aStyle = getComputedStyle(ancestor);
          if (aStyle.display === "none" || aStyle.visibility === "hidden") {
            clipped = true;
            break;
          }
          ancestor = ancestor.parentElement;
        }
        if (clipped) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
          continue;
        }
        out.push({
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          label: `${item.label}:${node.tagName.toLowerCase()}`
        });
      }
    }
    return out;
  }, selectors);
}

async function assertNoCrossGroupOverlaps(
  page: Page,
  groupA: Array<{ selector: string; label: string }>,
  groupB: Array<{ selector: string; label: string }>,
  context: string
) {
  const aBoxes = await collectBoxes(page, groupA);
  const bBoxes = await collectBoxes(page, groupB);
  for (const a of aBoxes) {
    for (const b of bBoxes) {
      expect(
        boxesOverlap(a, b),
        `${context}: overlap ${a.label} ↔ ${b.label} ` +
          `(a=${Math.round(a.left)},${Math.round(a.top)}-${Math.round(a.right)},${Math.round(a.bottom)} ` +
          `b=${Math.round(b.left)},${Math.round(b.top)}-${Math.round(b.right)},${Math.round(b.bottom)})`
      ).toBe(false);
    }
  }
}

async function loginAdminRobust(page: Page, nextPath = "/admin/orders") {
  const email = process.env.E2E_ADMIN_EMAIL?.trim() ?? "";
  const password = process.env.E2E_ADMIN_PASSWORD?.trim() ?? "";
  if (!email || !password) {
    throw new Error(credentialsSkipMessage("admin"));
  }

  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  const form = page.locator('[data-testid="login-auth-form"]');
  await expect(form).toBeVisible({ timeout: 30_000 });

  const emailInput = form.locator('input[type="email"]');
  const passwordInput = form.locator('input[type="password"], input[autocomplete="current-password"]');
  await emailInput.fill(email);
  await passwordInput.fill(password);

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/auth/login") && response.request().method() === "POST",
    { timeout: 60_000 }
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`login failed status=${response.status()} body=${body.slice(0, 240)}`);
  }
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

async function openOrdersWorkspace(page: Page) {
  await loginAdminRobust(page, "/admin/orders");
  await expect(page.locator("[data-admin-orders-shell]")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("[data-admin-order-row]").first()).toBeVisible({ timeout: 60_000 });
}

async function selectFirstOrder(page: Page) {
  const row = page.locator("[data-admin-order-row]").first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();

  // Empty state also uses [data-order-detail-panel] — wait for a selected-order signal instead.
  await expect(page.locator('[data-admin-order-row][aria-current="true"]')).toBeVisible({ timeout: 20_000 });
  // Shell mounts both stacked (<2xl) and column (2xl) rails; assert the visible one.
  await expect(page.locator("[data-admin-order-actions-rail]:visible")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Select an order")).toHaveCount(0);
}

async function assertViewportLayout(page: Page, vp: ViewportCase) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.waitForTimeout(250);

  // Re-assert selection survived resize (URL-driven state should hold).
  const selected = page.locator('[data-admin-order-row][aria-current="true"]');
  const actions = page.locator("[data-admin-order-actions-rail]:visible");

  if (vp.expectSplit) {
    await expect(selected, `${vp.id}: selected row visible in split`).toBeVisible();
    await expect(actions, `${vp.id}: actions rail visible`).toBeVisible();
  } else {
    // Narrow: list may hide; detail + actions (stacked) must remain.
    await expect(page.locator("[data-order-detail-panel]").first()).toBeVisible();
    // Actions may be below the fold — scroll into view if needed.
    if ((await page.locator("[data-admin-order-actions-rail]").count()) > 0) {
      await actions.first().scrollIntoViewIfNeeded().catch(() => undefined);
      await expect(actions.first()).toBeVisible();
    }
  }

  await assertNoCrossGroupOverlaps(
    page,
    [
      { selector: "[data-admin-order-actions-rail]:not(.hidden) button, [data-admin-order-actions-rail] button", label: "action-btn" },
      { selector: "[data-admin-order-actions-rail] select", label: "action-select" }
    ],
    [
      { selector: "[data-order-detail-panel] h3", label: "detail-heading" },
      { selector: "[data-order-detail-panel] section", label: "detail-section" }
    ],
    vp.id
  );

  if (vp.expectSplit) {
    const selectedIdText = await page.evaluate(() => {
      const selectedRow =
        document.querySelector<HTMLElement>('[data-admin-order-row][aria-current="true"]') ??
        document.querySelector<HTMLElement>("[data-admin-order-row]");
      if (!selectedRow) return "";
      const candidates = Array.from(selectedRow.querySelectorAll("h2, span, p")).map((n) =>
        (n.textContent ?? "").trim()
      );
      return (
        candidates.find((t) => /^ORD-/i.test(t)) ??
        candidates.find((t) => t.startsWith("OR") || /^[0-9a-f-]{8,}$/i.test(t)) ??
        ""
      );
    });

    expect(selectedIdText, `${vp.id}: selected list order id text`).not.toMatch(/^OR\.\.\.?$/i);
    if (selectedIdText.startsWith("ORD-")) {
      expect(selectedIdText.length, `${vp.id}: full order id readable`).toBeGreaterThan(8);
    }
  }

  await mkdir(SCREENSHOT_ROOT, { recursive: true });
  await page.screenshot({
    path: join(SCREENSHOT_ROOT, `${vp.id}.png`),
    fullPage: false
  });
}

test.describe.configure({ mode: "serial" });

test.describe("admin orders layout resilience (playwright)", () => {
  test("audits all aspect ratios and live resize without action/detail overlap", async ({ page }) => {
    test.skip(!hasRoleCredentials("admin"), credentialsSkipMessage("admin"));
    test.setTimeout(240_000);

    await openOrdersWorkspace(page);
    await selectFirstOrder(page);

    for (const vp of VIEWPORTS) {
      await assertViewportLayout(page, vp);
    }

    // Live resize sequence (definition of done: mid-transition must not stack).
    const sequence = [
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
      { width: 1100, height: 700 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
      { width: 1600, height: 1000 }
    ];

    for (const size of sequence) {
      await page.setViewportSize(size);
      await page.waitForTimeout(150);
      if ((await page.locator("[data-admin-order-actions-rail]:visible").count()) > 0) {
        await page.locator("[data-admin-order-actions-rail]:visible").first().scrollIntoViewIfNeeded().catch(() => undefined);
      }
      await assertNoCrossGroupOverlaps(
        page,
        [{ selector: "[data-admin-order-actions-rail] button", label: "action-btn" }],
        [
          { selector: "[data-order-detail-panel] h3", label: "detail-heading" },
          { selector: "[data-order-detail-panel] section", label: "detail-section" }
        ],
        `resize-${size.width}x${size.height}`
      );
    }
  });
});
