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
    expect(helpers).toContain('label: "Pending"');
    expect(helpers).toContain('label: "Processing"');
  });

  it("keeps the workspace shell in document flow without fixed mobile overlays or vh panel heights", () => {
    const shell = source("components/admin/orders/admin-orders-shell.tsx");

    expect(shell).toContain("data-admin-orders-shell");
    expect(shell).toContain("flex min-h-0 min-w-0 flex-1 flex-col");
    expect(shell).not.toContain("max-xl:fixed");
    expect(shell).not.toContain("max-xl:pb-24");
    expect(shell).not.toContain("100dvh");
    expect(shell).not.toContain("100vh");
    expect(shell).not.toContain("overscroll-contain");
  });

  it("uses fixed-range grid tracks with minmax(0,1fr) center column", () => {
    const shell = source("components/admin/orders/admin-orders-shell.tsx");

    expect(shell).toContain("minmax(280px,360px)_minmax(0,1fr)_minmax(260px,300px)");
    expect(shell).toContain("minmax(280px,360px)_minmax(0,1fr)");
    expect(shell).toContain("overflow-x-hidden");
    expect(shell).toContain("overflow-x-clip");
  });

  it("stacks detail and actions in document flow without flex-1 overflow paint", () => {
    const shell = source("components/admin/orders/admin-orders-shell.tsx");

    expect(shell).toContain("2xl:hidden");
    expect(shell).toContain("{actions}");
    // Detail wrapper must be intrinsic height so actions sit below (not flex-1 fighting siblings).
    expect(shell).toContain('<div className="min-w-0">{detail}</div>');
    expect(shell).not.toMatch(/flex-1[^"]*\{detail\}|\{detail\}[\s\S]*?flex-1/);
    expect(shell).not.toContain("max-h-[calc(100dvh-11rem)]");
  });

  it("pins 2xl three-column actions scroll contract to prevent overflow-paint regression", () => {
    const shell = source("components/admin/orders/admin-orders-shell.tsx");
    const actionsRail = source("components/admin/orders/admin-order-actions-rail.tsx");

    expect(shell).toContain('const scrollColumnClass = "min-h-0 min-w-0 overflow-x-hidden overflow-y-auto"');
    expect(shell).toContain("2xl:col-start-3");
    expect(shell).toContain("2xl:flex");
    expect(shell).toMatch(/hidden \$\{scrollColumnClass\} flex-col 2xl:col-start-3 2xl:flex/);
    expect(actionsRail).toContain("data-admin-order-actions-rail");
    expect(actionsRail).not.toContain("absolute");
    expect(actionsRail).not.toContain("fixed");
    expect(actionsRail).not.toContain("max-xl:fixed");
  });

  it("hides list on narrow viewports when an order is selected and shows back control", () => {
    const shell = source("components/admin/orders/admin-orders-shell.tsx");
    const detail = source("components/admin/orders/admin-order-detail.tsx");
    const primitives = source("components/admin/orders/order-detail-primitives.tsx");

    expect(shell).toContain("hidden xl:flex");
    expect(shell).toContain("hasSelectedOrder");
    expect(detail).toContain("Back to Orders");
    expect(detail).toContain("onClearSelection");
    expect(detail).toContain("lg:grid-cols-2");
    expect(primitives).toContain("xl:hidden");
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
    // Order chrome is static (outside scroll body), not sticky/absolute overlay.
    expect(primitives).toContain("orderHeader");
    expect(primitives).not.toMatch(/OrderStickyHeader[\s\S]*?sticky top-0/);
    expect(primitives).not.toContain("sticky top-0 z-20");
    expect(primitives).not.toContain("sticky top-0 z-10");
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
    expect(utils).not.toContain("orderSectionLabelSticky");
    expect(utils).toContain("orderCardStack");
  });

  it("documents virtualizer absolute row positioning as an intentional carve-out", () => {
    const list = source("components/admin/orders/admin-order-list.tsx");

    expect(list).toContain("absolute left-0 top-0 w-full");
    expect(list).toContain("Virtualization carve-out");
    expect(list).toContain("translateY");
  });

  it("places list order ID on its own row to avoid OR… truncation", () => {
    const listItem = source("components/admin/orders/admin-order-list-item.tsx");

    expect(listItem).toContain("OrderIdText");
    expect(listItem).toContain("moneyText(order.total)");
    // ID row and price/badge row are separate — not a single justify-between squeeze.
    expect(listItem).not.toContain("justify-between gap-x-2 gap-y-1");
  });
});
