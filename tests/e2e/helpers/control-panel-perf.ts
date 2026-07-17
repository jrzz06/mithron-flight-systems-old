import type { Page } from "@playwright/test";

export type ControlPanelTransition = {
  id: string;
  panel: "admin" | "warehouse" | "supplier";
  from: string;
  to: string;
  readySelector: string;
};

export const CONTROL_PANEL_TRANSITIONS: ControlPanelTransition[] = [
  { id: "admin-dashboard-products", panel: "admin", from: "/admin", to: "/admin/products", readySelector: "[data-product-search], [data-product-operational-grid]" },
  { id: "admin-dashboard-inventory", panel: "admin", from: "/admin", to: "/admin/inventory", readySelector: "[data-admin-inventory-route]" },
  { id: "admin-dashboard-orders", panel: "admin", from: "/admin", to: "/admin/orders", readySelector: "[data-order-status-board], [data-order-filter-form]" },
  { id: "admin-products-inventory", panel: "admin", from: "/admin/products", to: "/admin/inventory", readySelector: "[data-admin-inventory-route]" },
  { id: "admin-inventory-orders", panel: "admin", from: "/admin/inventory", to: "/admin/orders", readySelector: "[data-order-status-board], [data-order-filter-form]" },
  { id: "admin-orders-cms", panel: "admin", from: "/admin/orders", to: "/admin/cms", readySelector: "[data-admin-cms-route], [data-cms-home-dashboard]" },
  { id: "warehouse-dashboard-orders", panel: "warehouse", from: "/warehouse/dashboard", to: "/warehouse/orders", readySelector: "[data-warehouse-orders-route], [data-order-filter-form]" },
  { id: "warehouse-dashboard-fulfillment", panel: "warehouse", from: "/warehouse/dashboard", to: "/warehouse/fulfillment", readySelector: "[data-warehouse-fulfillment-route]" },
  { id: "warehouse-orders-fulfillment", panel: "warehouse", from: "/warehouse/orders", to: "/warehouse/fulfillment", readySelector: "[data-warehouse-fulfillment-route]" },
  { id: "supplier-home-products", panel: "supplier", from: "/supplier", to: "/supplier/products", readySelector: "[data-supplier-products-route]" },
  { id: "supplier-home-stock", panel: "supplier", from: "/supplier", to: "/supplier/inventory", readySelector: "[data-supplier-inventory-route]" },
  { id: "supplier-products-stock", panel: "supplier", from: "/supplier/products", to: "/supplier/inventory", readySelector: "[data-supplier-inventory-route]" }
];

export type NavigationPerfSample = {
  id: string;
  panel: ControlPanelTransition["panel"];
  from: string;
  to: string;
  ttfbMs: number;
  domContentLoadedMs: number;
  readyMs: number;
};

export async function measureTransition(page: Page, transition: ControlPanelTransition): Promise<NavigationPerfSample> {
  await page.goto(transition.from, { waitUntil: "domcontentloaded" });
  await page.locator(transition.readySelector).first().waitFor({ state: "visible", timeout: 45_000 });

  const startedAt = Date.now();
  const navigation = page.waitForResponse(
    (response) => response.url().includes(transition.to) && response.request().resourceType() === "document",
    { timeout: 45_000 }
  );

  await page.locator(`a[href="${transition.to}"], a[href^="${transition.to}"]`).first().click();
  await navigation;
  await page.locator(transition.readySelector).first().waitFor({ state: "visible", timeout: 45_000 });

  const timing = await page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation").at(-1) as PerformanceNavigationTiming | undefined;
    return {
      ttfbMs: entry ? entry.responseStart : 0,
      domContentLoadedMs: entry ? entry.domContentLoadedEventEnd : 0
    };
  });

  return {
    id: transition.id,
    panel: transition.panel,
    from: transition.from,
    to: transition.to,
    ttfbMs: Math.round(timing.ttfbMs),
    domContentLoadedMs: Math.round(timing.domContentLoadedMs),
    readyMs: Date.now() - startedAt
  };
}
