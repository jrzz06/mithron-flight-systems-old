import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildInventoryExportCsv,
  buildInventorySnapshot,
  CSV_IMPORT_SOURCE_TAG,
  customerFacingAvailability,
  mapInventoryCsvRows,
  parseInventoryCsv
} from "@/services/inventory-csv";
import { buildSimpleInventoryRows, resolveStockStatus } from "@/services/simple-inventory-view";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("inventory CSV workflow", () => {
  it("maps inventory CSV rows into validated Supabase inventory records", () => {
    const csv = [
      "Product image,Product variant,SKU,Total value,Inventory",
      "\"https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/a.jpg\",HPC - 3 Power Cube,,\"₹3,50,000.00\",10",
      "\"https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/b.jpg\",Drone Soccer,DRONE-SOCCER,\"₹450.00\",0"
    ].join("\n");

    const mapped = mapInventoryCsvRows(parseInventoryCsv(csv));

    expect(mapped.records).toHaveLength(2);
    expect(mapped.records[0]).toMatchObject({
      productName: "HPC - 3 Power Cube",
      sku: "HPC-3-POWER-CUBE",
      stock: 10,
      stockStatus: "available",
      totalValue: 350000,
      unitPrice: 35000,
      category: "Imported Inventory"
    });
    expect(mapped.records[1]).toMatchObject({
      sku: "DRONE-SOCCER",
      stock: 0,
      stockStatus: "out_of_stock"
    });
    expect(mapped.warnings.some((warning) => warning.includes("generated SKU"))).toBe(true);
    expect(mapped.errors).toEqual([]);
  });

  it("hides internal CSV import tags from customer-facing availability", () => {
    expect(customerFacingAvailability("wix_inventory_csv")).toBe("In stock");
    expect(customerFacingAvailability(CSV_IMPORT_SOURCE_TAG)).toBe("In stock");
    expect(customerFacingAvailability("Made to order")).toBe("Made to order");
    expect(customerFacingAvailability("InStock")).toBe("In stock");
    expect(customerFacingAvailability("OutOfStock")).toBe("Out of stock");
    expect(customerFacingAvailability("Unknown")).toBe("In stock");
  });

  it("flags duplicate SKUs and invalid stock before import", () => {
    const csv = [
      "Product image,Product variant,SKU,Total value,Inventory",
      "not-a-url,First,DUP,\"₹100.00\",5",
      "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/b.jpg,Second,DUP,\"₹200.00\",bad"
    ].join("\n");

    const mapped = mapInventoryCsvRows(parseInventoryCsv(csv));

    expect(mapped.errors.join("\n")).toContain("Duplicate SKU");
    expect(mapped.errors.join("\n")).toContain("Invalid stock");
    expect(mapped.warnings.join("\n")).toContain("Invalid image URL");
  });

  it("builds exportable inventory snapshots from the current rows", () => {
    const rows = [
      {
        id: "IN-WEST-01:a:A",
        productSlug: "a",
        productName: "A",
        productImage: "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/a.jpg",
        sku: "A",
        variantId: null,
        warehouseCode: "IN-WEST-01",
        stockStatus: "available" as const,
        quantity: 4,
        category: "Accessories",
        price: 250,
        inventoryValue: 1000,
        lastUpdated: "2026-05-25T10:00:00.000Z",
        warehouseUpdatedAt: "2026-05-25T10:00:00.000Z",
        inventoryUpdatedAt: "2026-05-25T10:00:00.000Z",
        supplierName: "",
        isArchived: false
      },
      {
        id: "IN-WEST-01:b:B",
        productSlug: "b",
        productName: "B",
        productImage: null,
        sku: "B",
        variantId: null,
        warehouseCode: "IN-WEST-01",
        stockStatus: "out_of_stock" as const,
        quantity: 0,
        category: "Accessories",
        price: 100,
        inventoryValue: 0,
        lastUpdated: null,
        warehouseUpdatedAt: null,
        inventoryUpdatedAt: null,
        supplierName: "",
        isArchived: false
      }
    ];

    const snapshot = buildInventorySnapshot(rows as import("@/services/simple-inventory-view").SimpleInventoryRow[]);
    const csv = buildInventoryExportCsv(rows as import("@/services/simple-inventory-view").SimpleInventoryRow[]);

    expect(snapshot).toMatchObject({
      productCount: 2,
      stockUnits: 4,
      totalValue: 1000,
      outOfStockCount: 1
    });
    expect(csv).toContain("Product image,Product name,SKU,Inventory status,Stock quantity,Category,Price,Inventory value,Updated time");
    expect(csv).toContain("In stock");
  });

  it("builds synthetic inventory rows for catalog products without inventory records", () => {
    const products = [
      { slug: "zio", name: "ZIO", category: "Drones", price: 1200, workflow_status: "published" },
      { slug: "pixy-lr", name: "Pixy LR", category: "Drones", price: 900, workflow_status: "published" }
    ];

    const rows = buildSimpleInventoryRows(
      products,
      [{ product_slug: "zio", sku: "ZIO", stock_status: "available", quantity: 0, reserved_quantity: 0, reorder_threshold: 0 }],
      "IN-WEST-01"
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      productSlug: "zio",
      sku: "ZIO",
      quantity: 0,
      stockStatus: "out_of_stock"
    });
    expect(rows[1]).toMatchObject({
      productSlug: "pixy-lr",
      sku: "PIXY-LR",
      quantity: 0,
      stockStatus: "out_of_stock"
    });
  });

  it("builds one warehouse row per product and resolves stale available status at zero quantity", () => {
    const products = [{ slug: "drone-kit", name: "Drone Kit", category: "Kits", price: 500, workflow_status: "published" }];
    const inventory = [
      { product_slug: "drone-kit", sku: "DRONE-KIT", stock_status: "available", quantity: 0, reserved_quantity: 0, reorder_threshold: 0 }
    ];

    const rows = buildSimpleInventoryRows(products, inventory, "IN-WEST-01");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sku: "DRONE-KIT", quantity: 0, stockStatus: "out_of_stock" });
    expect(resolveStockStatus("available", 0)).toBe("out_of_stock");
  });

  it("uses the product catalog for admin inventory pages", () => {
    const manager = source("components/admin/inventory-manager.tsx");
    const adminPage = source("app/admin/inventory/page.tsx");
    const actions = source("app/warehouse/actions.ts");
    const exportRoute = source("app/admin/inventory/export/route.ts");
    const csvSource = source("services/csv-inventory-source.ts");
    const importScript = source("tools/import-inventory-csv-to-supabase.cjs");

    expect(manager).toContain("data-inventory-system");
    expect(manager).toContain("data-inventory-table");
    expect(manager).toContain("data-inventory-csv-import");
    expect(manager).toContain("Supabase inventory records are the source of truth");
    expect(adminPage).toContain("InventoryActionBridge");
    expect(adminPage).toContain("getCsvInventoryRows");
    expect(actions).toContain("saveInventoryQuickEditFormAction");
    expect(actions).toContain("importInventoryCsvFormAction");
    expect(actions).toContain("fetchInventoryCsvSourceSlugs");
    expect(actions).toContain("CSV_IMPORT_SOURCE_TAG");
    expect(actions).not.toContain("Wix inventory");
    expect(csvSource).toContain('"mithron_products"');
    expect(csvSource).toContain("order=sort_order.asc");
    expect(csvSource).toContain('"inventory"');
    expect(csvSource).toContain("catalogFilter");
    expect(importScript).toContain("fetchInventoryCsvSourceSlugs");
    expect(importScript).toContain("CSV_IMPORT_SOURCE_TAG");
    expect(exportRoute).toContain("getCsvInventoryRows");
  });

  it("keeps warehouse quick stock edits on admin permissions only", () => {
    const actions = source("app/warehouse/actions.ts");
    const quickEditStart = actions.indexOf("export async function saveInventoryQuickEditFormAction");
    const quickEditEnd = actions.indexOf("export async function importInventoryCsvFormAction");
    const quickEdit = actions.slice(quickEditStart, quickEditEnd);
    const permissionGuard = quickEdit.indexOf('roleHasPermission(auth.role, "products.write")');
    const archiveGuard = quickEdit.indexOf('const shouldArchiveProduct = stockStatus === "archived";');
    const archivePreflight = quickEdit.indexOf('if (shouldArchiveProduct) await assertAdminMutationPermission("mithron_products", actorId);');
    const inventoryWrite = quickEdit.indexOf("saveProductInventory");

    expect(permissionGuard).toBeGreaterThan(-1);
    expect(actions).toContain("saveProductInventory");
    expect(archiveGuard).toBeGreaterThan(permissionGuard);
    expect(archivePreflight).toBeGreaterThan(archiveGuard);
    expect(archivePreflight).toBeLessThan(inventoryWrite);
    expect(actions).toContain("requireProductCatalogActor");
    expect(actions).toContain("updateProductPublicationRecord");
  });
});
