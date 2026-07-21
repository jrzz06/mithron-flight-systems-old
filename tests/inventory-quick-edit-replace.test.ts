import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveProductSku } from "@/lib/product-sku";

/**
 * Mirrors the replace-mode quantity resolution in saveInventoryQuickEditFormAction.
 * When adjustment_quantity is absent, absolute `quantity` must win (not default 0).
 */
function resolveReplaceQuantity(input: {
  quantity: number;
  hasAdjustmentQuantity: boolean;
  adjustmentQuantity: number | null;
}) {
  if (input.hasAdjustmentQuantity) {
    return input.adjustmentQuantity as number;
  }
  return input.quantity;
}

function parseSelectedInventoryRowKey(selected: string, defaultWarehouse: string) {
  const parts = selected.split("::").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return { warehouseCode: parts[0]!, productSlug: parts[1]!, sku: parts[2]! };
  }
  if (parts.length === 2) {
    return { warehouseCode: defaultWarehouse, productSlug: parts[0]!, sku: parts[1]! };
  }
  if (parts.length === 1) {
    const productSlug = parts[0]!;
    return { warehouseCode: defaultWarehouse, productSlug, sku: deriveProductSku(productSlug) };
  }
  return { warehouseCode: defaultWarehouse, productSlug: "", sku: "" };
}

describe("inventory quick-edit replace quantity", () => {
  it("uses absolute quantity when adjustment_quantity is absent", () => {
    expect(
      resolveReplaceQuantity({ quantity: 12, hasAdjustmentQuantity: false, adjustmentQuantity: null })
    ).toBe(12);
  });

  it("prefers adjustment_quantity when present including zero", () => {
    expect(
      resolveReplaceQuantity({ quantity: 12, hasAdjustmentQuantity: true, adjustmentQuantity: 0 })
    ).toBe(0);
    expect(
      resolveReplaceQuantity({ quantity: 12, hasAdjustmentQuantity: true, adjustmentQuantity: 5 })
    ).toBe(5);
  });

  it("wires warehouse actions to check for absent adjustment_quantity", () => {
    const source = readFileSync(join(process.cwd(), "app/warehouse/actions.ts"), "utf8");
    expect(source).toContain("hasAdjustmentQuantity");
    expect(source).toContain('Boolean(readInventoryString(formData, "adjustment_quantity"))');
    expect(source).toContain("parseSelectedInventoryRowKey");
  });

  it("parses composite and slug-only selection keys", () => {
    expect(parseSelectedInventoryRowKey("IN-WEST-01::agri-drone-x1::AGRI-DRONE-X1", "IN-WEST-01")).toEqual({
      warehouseCode: "IN-WEST-01",
      productSlug: "agri-drone-x1",
      sku: "AGRI-DRONE-X1"
    });
    expect(parseSelectedInventoryRowKey("agri-drone-x1", "IN-WEST-01")).toEqual({
      warehouseCode: "IN-WEST-01",
      productSlug: "agri-drone-x1",
      sku: "AGRI-DRONE-X1"
    });
  });

  it("emits warehouse::slug::sku row keys from inventory manager", () => {
    const source = readFileSync(join(process.cwd(), "components/admin/inventory-manager.tsx"), "utf8");
    expect(source).toContain("${row.warehouseCode}::${row.productSlug}::${row.sku}");
  });
});
