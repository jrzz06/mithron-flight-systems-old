import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("admin orders layout resilience", () => {
  it("keeps the workspace shell sticky chrome ordered header → filters → tabs", () => {
    const shell = source("components/admin/orders/admin-orders-shell.tsx");
    const toolbar = source("components/admin/orders/admin-orders-toolbar.tsx");
    const helpers = source("components/admin/orders/order-view-helpers.ts");

    expect(shell).toContain("data-admin-orders-shell");
    expect(shell).toContain("{header}");
    expect(shell).toContain("{filters}");
    expect(shell).toContain("{toolbar}");
    expect(toolbar).toContain("ADMIN_ORDERS_VIEW_TABS");
    expect(toolbar).not.toContain("data-admin-orders-kpi-strip");
    expect(toolbar).not.toContain("Pending verification");
    expect(helpers).toContain('label: "Later"');
    expect(helpers).toContain('label: "Processing"');
  });

  it("keeps the workspace shell in document flow without fixed mobile overlays", () => {
    const shell = source("components/admin/orders/admin-orders-shell.tsx");

    expect(shell).toContain("data-admin-orders-shell");
    expect(shell).not.toContain("max-xl:fixed");
    expect(shell).not.toContain("max-xl:pb-24");
    expect(shell).toContain("100dvh");
  });

  it("uses fixed-range grid tracks with minmax(0,1fr) center column", () => {
    const shell = source("components/admin/orders/admin-orders-shell.tsx");

    expect(shell).toContain("minmax(240px,280px)_minmax(0,1fr)_minmax(260px,300px)");
    expect(shell).toContain("minmax(260px,300px)_minmax(0,1fr)");
    expect(shell).toContain("overflow-x-hidden");
    expect(shell).toContain("overflow-x-clip");
  });

  it("hides list on mobile when an order is selected and shows back control", () => {
    const shell = source("components/admin/orders/admin-orders-shell.tsx");
    const detail = source("components/admin/orders/admin-order-detail.tsx");

    expect(shell).toContain("hidden lg:flex");
    expect(shell).toContain("hasSelectedOrder");
    expect(detail).toContain("Back to Orders");
    expect(detail).toContain("onClearSelection");
    expect(detail).toContain("lg:grid-cols-2");
  });

  it("keeps status badge labels on a single line with ellipsis", () => {
    const badge = source("components/admin/orders/order-status-badge.tsx");

    expect(badge).toContain("whitespace-nowrap");
    expect(badge).toContain("truncate");
    expect(badge).not.toContain("flex-wrap");
    expect(badge).not.toContain("orderLongText");
  });

  it("uses responsive long-text field layout in order primitives", () => {
    const primitives = source("components/admin/orders/order-detail-primitives.tsx");

    expect(primitives).toContain("export function OrderIdText");
    expect(primitives).toContain("export function OrderStickyHeader");
    expect(primitives).toContain("title={value}");
    expect(primitives).toContain("Copy order ID");
    expect(primitives).toContain('from "@/components/admin/orders/order-layout-utils"');
    expect(primitives).toContain("orderLongText");
    expect(primitives).toContain("orderCardPad");
    expect(primitives).toContain("orderSectionLabel");
    expect(primitives).not.toContain("orderSectionLabelSticky");
    expect(primitives).toContain("orderCardStack");
    expect(primitives).not.toContain('style={{ maxHeight: "calc(100vh - 10rem)" }}');
  });

  it("collapses Danger Zone by default", () => {
    const actionsRail = source("components/admin/orders/admin-order-actions-rail.tsx");
    const primitives = source("components/admin/orders/order-detail-primitives.tsx");

    expect(actionsRail).toContain('title="Danger Zone"');
    expect(actionsRail).toContain("collapsible");
    expect(actionsRail).toContain("defaultOpen={false}");
    expect(primitives).toContain("collapsible = false");
    expect(primitives).toContain("defaultOpen = true");
  });

  it("renders timeline markers without absolute content positioning", () => {
    const timeline = source("components/admin/orders/admin-order-timeline.tsx");

    expect(timeline).not.toContain("absolute -left");
    expect(timeline).not.toContain('className="absolute bottom-2');
    expect(timeline).toContain("border-l-2");
    expect(timeline).toContain("grid-cols-[auto_minmax(0,1fr)]");
  });

  it("keeps actions rail in flow on smaller breakpoints", () => {
    const actionsRail = source("components/admin/orders/admin-order-actions-rail.tsx");

    expect(actionsRail).toContain("data-admin-order-actions-rail");
    expect(actionsRail).not.toContain("max-xl:fixed");
    expect(actionsRail).not.toContain("max-h-[42vh]");
    expect(actionsRail).toContain("w-full");
  });

  it("exports shared layout utility classes for long content", () => {
    const utils = source("components/admin/orders/order-layout-utils.ts");

    expect(utils).toContain("orderLongText");
    expect(utils).toContain("overflow-wrap:anywhere");
    expect(utils).toContain("orderClamp2");
    expect(utils).toContain("orderWrapRow");
    expect(utils).toContain("orderCardPad");
    expect(utils).toContain("orderSectionLabel");
    expect(utils).toContain("orderCardStack");
  });
});
