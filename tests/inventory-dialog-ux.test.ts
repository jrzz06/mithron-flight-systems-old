import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryManager } from "@/components/admin/inventory-manager";
import type { SimpleInventoryRow } from "@/services/simple-inventory-view";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const inventoryRow: SimpleInventoryRow = {
  id: "IN-WEST-01::hpc-3-power-cube::HPC-3-POWER-CUBE",
  productSlug: "hpc-3-power-cube",
  productName: "HPC-3 Power Cube",
  productImage: null,
  sku: "HPC-3-POWER-CUBE",
  variantId: null,
  warehouseCode: "IN-WEST-01",
  stockStatus: "available",
  quantity: 19,
  category: "Power",
  price: 1200,
  inventoryValue: 22800,
  lastUpdated: "2026-05-26T12:00:00.000Z",
  supplierName: "",
  warehouseUpdatedAt: "2026-05-26T12:00:00.000Z",
  inventoryUpdatedAt: "2026-05-26T12:00:00.000Z",
  isArchived: false
};

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("inventory dialog and stock workflow UX", () => {
  it("centers inventory dialogs through a viewport portal with scroll lock and escape close", () => {
    const manager = source("components/admin/inventory-manager.tsx");

    expect(manager).toContain("createPortal");
    expect(manager).toContain("data-inventory-dialog-portal");
    expect(manager).toContain("data-inventory-adjust-dialog");
    expect(manager).toContain("data-inventory-adjust-form");
    expect(manager).toContain("adjustment_mode");
    expect(manager).toContain("reason_code");
    expect(manager).toContain("document.body.style.overflow");
    expect(manager).toContain("keydown");
    expect(manager).toContain("Escape");
    expect(manager).toContain("fixed inset-0");
    expect(manager).not.toContain("absolute-position");
    expect(manager).not.toContain("data-inventory-edit-dialog");
  });

  it("reduces table clutter and moves row operations into a single action menu", () => {
    const manager = source("components/admin/inventory-manager.tsx");

    expect(manager).toContain("data-inventory-sticky-toolbar");
    expect(manager).toContain("data-inventory-action-menu");
    expect(manager).toContain("data-inventory-action=\"edit\"");
    expect(manager).toContain("data-inventory-action=\"stock\"");
    expect(manager).toContain("data-inventory-action=\"archive\"");
    expect(manager).toContain("data-inventory-action=\"view\"");
    expect(manager).toContain("<StatusPill");
    expect(manager).not.toContain("data-inventory-action=\"archive-product\"");
    expect(manager).not.toContain("data-inventory-action=\"reserve\"");
    expect(manager).not.toContain("data-inventory-action=\"discontinued\"");
    expect(manager).not.toContain(">Stock update</button>");
  });

  it("adds inline stock editing, quick increments, bulk drawer, responsive cards, and bounded reads", () => {
    const manager = source("components/admin/inventory-manager.tsx");
    const csvSource = source("services/csv-inventory-source.ts");
    const adminPage = source("app/admin/inventory/page.tsx");
    const adminExport = source("app/admin/inventory/export/route.ts");

    expect(manager).toContain("data-inventory-inline-stock");
    expect(manager).toContain("data-inventory-increment=\"1\"");
    expect(manager).toContain("data-inventory-increment=\"5\"");
    expect(manager).toContain("data-inventory-increment=\"10\"");
    expect(manager).toContain("data-inventory-bulk-drawer");
    expect(manager).toContain("data-inventory-restock-minibar");
    expect(manager).toContain("Restock all");
    expect(manager).toContain("data-inventory-mobile-cards");
    expect(manager).toContain("content-visibility-auto");
    expect(csvSource).toContain("CSV_INVENTORY_PAGE_SIZE");
    expect(csvSource).toContain("offset=");
    expect(csvSource).toContain("columnInFilter");
    expect(adminPage).toContain("pageSize: CSV_INVENTORY_PAGE_SIZE");
    expect(adminPage).toContain("restockAllAdminInventoryAction");
    expect(adminExport).toContain("all: true");
  });

  it("renders the adjust stock dialog in a body-level fixed portal and releases scroll lock on escape", async () => {
    const action = vi.fn();

    render(createElement(InventoryManager, {
      rows: [inventoryRow],
      action,
      adjustAction: action,
      importAction: action,
      bulkAction: action,
      exportHref: "/admin/inventory/export"
    }));

    fireEvent.click(screen.getByLabelText("More actions for HPC-3 Power Cube"));
    fireEvent.click(screen.getByRole("button", { name: "Adjust stock" }));

    const portal = document.body.querySelector("[data-inventory-dialog-portal]");
    expect(portal).toBeInTheDocument();
    expect(portal?.parentElement).toBe(document.body);
    expect(portal).toHaveClass("fixed");
    expect(portal).toHaveClass("inset-0");
    expect(document.body.querySelector("[data-inventory-adjust-dialog]")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(document.body.querySelector("[data-inventory-adjust-dialog]")).not.toBeInTheDocument();
    });
    expect(document.body.style.overflow).toBe("");
  });
});
