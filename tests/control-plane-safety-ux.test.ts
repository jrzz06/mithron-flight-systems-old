import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("control plane safety UX hardening", () => {
  it("supports typed confirmation on shared confirm dialog and submit button", () => {
    const dialog = source("components/notifications/confirm-dialog.tsx");
    const submit = source("components/admin/operational-submit-button.tsx");
    const danger = source("components/admin/operational-action-panel.tsx");

    expect(dialog).toContain("requireTypedText");
    expect(dialog).toContain("typedMatches");
    expect(submit).toContain("requireTypedText");
    expect(submit).toContain("confirmDescription");
    expect(danger).toContain("requireTypedText");
    expect(danger).toContain("confirmMessage");
  });

  it("requires confirm + type-to-confirm on permanent deletes and warehouse cancel", () => {
    const actionsRail = source("components/admin/orders/admin-order-actions-rail.tsx");
    const quickActions = source("components/admin/orders/admin-order-row-quick-actions.tsx");
    const queueTable = source("components/warehouse/warehouse-order-queue-table.tsx");
    const fulfillment = source("components/warehouse/warehouse-fulfillment-detail.tsx");
    const supplierProducts = source("app/supplier/products/page.tsx");
    const inventoryManager = source("components/admin/inventory-manager.tsx");

    expect(actionsRail).toContain('confirmMessage={`Cancel order ${orderLabel}?`}');
    expect(actionsRail).toContain("requireTypedText={orderLabel}");
    expect(quickActions).toContain("requireTypedText={orderLabel}");
    expect(queueTable).toContain("requireTypedText={order.orderNumber}");
    expect(fulfillment).toContain("requireTypedText={orderRow.orderNumber}");
    expect(supplierProducts).toContain('requireTypedText="DELETE"');
    expect(inventoryManager).toContain("requireTypedText={deleteRow.productSlug}");
    expect(inventoryManager).toContain("data-inventory-delete-modal");
  });

  it("keeps admin orders live for shipments/inventory and surfaces snapshot limits", () => {
    const workspace = source("components/admin/admin-orders-workspace.tsx");
    const toolbar = source("components/admin/orders/admin-orders-toolbar.tsx");
    const list = source("components/admin/orders/admin-order-list.tsx");

    expect(workspace).toContain('useAdminLiveCollectionRows');
    expect(workspace).toContain('"shipments"');
    expect(workspace).toContain('"inventory"');
    expect(workspace).toContain("snapshotLimitWarning");
    expect(toolbar).toContain("snapshotLimitWarning");
    expect(list).toContain("useVirtualizer");
  });

  it("adds press micro-interactions without framer-motion", () => {
    const platformCss = source("app/platform.css");
    const packageJson = source("package.json");

    expect(platformCss).toContain(".platform-btn-secondary:active:not(:disabled)");
    expect(platformCss).toContain(".platform-btn-ghost:active:not(:disabled)");
    expect(platformCss).toContain(".platform-btn-danger:active:not(:disabled)");
    expect(platformCss).toContain("confirm-dialog-panel");
    expect(packageJson).not.toContain("framer-motion");
    expect(packageJson).not.toContain('"gsap"');
  });
});
