import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildInventoryMovementRecord,
  buildWarehouseMovementFormFromFormData,
  shouldDeductFulfillmentStock
} from "@/services/warehouse-movements";
import {
  assertAdminMutationPermission,
  updateAdminRecord,
  deleteAdminRecord
} from "@/services/admin-actions";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("warehouse inventory movement ledger", () => {
  it("builds immutable SKU-safe movement records with quantity before and after", () => {
    const record = buildInventoryMovementRecord({
      productId: "source-agri-kisan-drone-small-8-liter",
      sku: " AG-8L-BASE ",
      variantId: "base",
      warehouseCode: " IN-WEST-01 ",
      warehouseStockId: "11111111-1111-1111-1111-111111111111",
      movementType: "stock_in",
      quantityBefore: 4,
      quantityDelta: 3,
      reasonCode: "cycle_count",
      notes: "Cycle count restock",
      actorUserId: "00000000-0000-0000-0000-000000000001",
      relatedOrderId: null,
      relatedShipmentId: null,
      at: "2026-05-24T10:00:00.000Z"
    });

    expect(record).toEqual({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      sku: "AG-8L-BASE",
      variant_id: "base",
      warehouse_code: "IN-WEST-01",
      warehouse_stock_id: "11111111-1111-1111-1111-111111111111",
      movement_type: "stock_in",
      quantity_delta: 3,
      quantity_before: 4,
      quantity_after: 7,
      reason_code: "cycle_count",
      notes: "Cycle count restock",
      actor_user_id: "00000000-0000-0000-0000-000000000001",
      related_order_id: null,
      related_shipment_id: null,
      created_at: "2026-05-24T10:00:00.000Z"
    });
  });

  it("maps product_slug to product_id before inserting inventory movement rows", async () => {
    const { toInventoryMovementInsertPayload } = await import("@/services/admin-actions");
    expect(toInventoryMovementInsertPayload({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      sku: "AG-8L-BASE",
      movement_type: "stock_in",
      quantity_delta: 1,
      quantity_before: 0,
      quantity_after: 1,
      reason_code: "cycle_count",
      warehouse_code: "IN-WEST-01"
    })).toEqual({
      product_id: "source-agri-kisan-drone-small-8-liter",
      sku: "AG-8L-BASE",
      movement_type: "stock_in",
      quantity_delta: 1,
      quantity_before: 0,
      quantity_after: 1,
      reason_code: "cycle_count",
      warehouse_code: "IN-WEST-01"
    });
  });

  it("rejects movement records that would create impossible negative stock", () => {
    expect(() => buildInventoryMovementRecord({
      productId: "source-agri-kisan-drone-small-8-liter",
      sku: "AG-8L-BASE",
      variantId: null,
      warehouseCode: "IN-WEST-01",
      warehouseStockId: null,
      movementType: "stock_out",
      quantityBefore: 2,
      quantityDelta: -3,
      reasonCode: "manual_stock_out",
      notes: null,
      actorUserId: null,
      relatedOrderId: null,
      relatedShipmentId: null,
      at: "2026-05-24T10:00:00.000Z"
    })).toThrow("Inventory movement would make available stock negative.");
  });

  it("normalizes warehouse movement forms for stock in, stock out, correction, return, and damaged flows", () => {
    expect(buildWarehouseMovementFormFromFormData(formData({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      sku: "AG-8L-BASE",
      warehouse_code: "IN-WEST-01",
      movement_type: "stock_in",
      movement_quantity: "5",
      reason_code: "supplier_receipt"
    }))).toMatchObject({
      movementType: "stock_in",
      quantityDelta: 5,
      targetQuantity: null
    });

    expect(buildWarehouseMovementFormFromFormData(formData({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      sku: "AG-8L-BASE",
      warehouse_code: "IN-WEST-01",
      movement_type: "damaged",
      movement_quantity: "2",
      reason_code: "field_damage"
    }))).toMatchObject({
      movementType: "damaged",
      quantityDelta: -2,
      targetQuantity: null
    });

    expect(buildWarehouseMovementFormFromFormData(formData({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      sku: "AG-8L-BASE",
      warehouse_code: "IN-WEST-01",
      movement_type: "correction",
      quantity_after: "9",
      reason_code: "cycle_count"
    }))).toMatchObject({
      movementType: "correction",
      quantityDelta: null,
      targetQuantity: 9
    });
  });

  it("deducts stock on packed when trigger is packed", () => {
    expect(shouldDeductFulfillmentStock("processing", "packed", "packed")).toBe(true);
    expect(shouldDeductFulfillmentStock("packed", "ready_to_dispatch", "packed")).toBe(false);
  });

  it("deducts stock on dispatch states when trigger is dispatched (default)", () => {
    expect(shouldDeductFulfillmentStock("packed", "ready_to_dispatch", "dispatched")).toBe(true);
    expect(shouldDeductFulfillmentStock("picked", "shipped", "dispatched")).toBe(true);
    expect(shouldDeductFulfillmentStock("shipped", "delivered", "dispatched")).toBe(false);
    expect(shouldDeductFulfillmentStock("processing", "packed", "dispatched")).toBe(false);
  });

  it("adds additive inventory_movements schema with RLS, indexes, FKs, and realtime readiness", () => {
    const migrationPath = join(process.cwd(), "supabase", "migrations", "20260524000500_inventory_movements.sql");
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    for (const column of [
      "create table if not exists public.inventory_movements",
      "product_id text not null references public.mithron_products(slug)",
      "variant_id text",
      "warehouse_stock_id uuid references public.warehouse_stock(id)",
      "movement_type text not null",
      "quantity_delta integer not null",
      "quantity_before integer not null",
      "quantity_after integer not null",
      "reason_code text not null",
      "actor_user_id uuid references auth.users(id)",
      "related_order_id uuid references public.orders(id)",
      "related_shipment_id uuid",
      "created_at timestamptz not null default now()"
    ]) {
      expect(sql).toContain(column);
    }

    expect(sql).toContain("inventory_movements_movement_type_chk");
    expect(sql).toContain("stock_in");
    expect(sql).toContain("fulfillment");
    expect(sql).toContain("inventory_movements_product_variant_idx");
    expect(sql).toContain("inventory_movements_stock_idx");
    expect(sql).toContain("alter table public.inventory_movements enable row level security");
    expect(sql).toContain("inventory_movements warehouse read");
    expect(sql).toContain("inventory_movements warehouse insert");
    expect(sql).toContain("alter publication supabase_realtime add table public.inventory_movements");
  });

  it("wires ledger creation through warehouse, admin inventory, and fulfillment flows", () => {
    const adminActions = readFileSync(join(process.cwd(), "services", "admin-actions.ts"), "utf8");
    const warehouseActions = readFileSync(join(process.cwd(), "app", "warehouse", "actions.ts"), "utf8");
    const productWorkflow = readFileSync(join(process.cwd(), "services", "product-inventory-workflow.ts"), "utf8");
    const warehouseInventoryPage = readFileSync(join(process.cwd(), "app", "warehouse", "inventory", "page.tsx"), "utf8");
    const inventoryManager = readFileSync(join(process.cwd(), "components", "admin", "inventory-manager.tsx"), "utf8");
    const warehousePage = readFileSync(join(process.cwd(), "app", "warehouse", "page.tsx"), "utf8");
    const movementsPage = readFileSync(join(process.cwd(), "app", "warehouse", "movements", "page.tsx"), "utf8");
    const adminSnapshot = readFileSync(join(process.cwd(), "services", "admin.ts"), "utf8");

    expect(adminActions).toContain("\"inventory_movements\"");
    expect(adminActions).toContain("createInventoryMovementRecord");
    expect(warehouseActions).toContain("applyWarehouseMovementFormAction");
    expect(warehouseActions).toContain("saveSimpleInventoryFormAction");
    expect(warehouseActions).toContain("saveInventoryQuickEditFormAction");
    expect(warehouseActions).toContain("recordInventoryMovementForStockChange");
    expect(warehouseActions).toContain("applyFulfillmentStockMovements");
    expect(productWorkflow).toContain("recordInventoryMovementForStockChange");
    expect(warehouseInventoryPage).toContain("InventoryManager");
    expect(inventoryManager).not.toContain("data-inventory-quick-edit-form");
    expect(inventoryManager).toContain("data-inventory-adjust-form");
    expect(inventoryManager).toContain("name=\"stock_status\"");
    expect(inventoryManager).toContain("name=\"quantity\"");
    expect(inventoryManager).toContain("inventory_movements");
    expect(warehousePage).toContain("redirect(\"/warehouse/dashboard\")");
    expect(movementsPage).toContain("data-warehouse-ledger-table");
    expect(movementsPage).toContain("movement_type");
    expect(adminSnapshot).toContain("inventory_movements");
    expect(adminSnapshot).toContain("movements");
  });

  it("keeps movement records insert-only through the admin mutation surface", async () => {
    await expect(assertAdminMutationPermission(
      "inventory_movements",
      "00000000-0000-0000-0000-000000000001",
      { guard: (permission) => expect(permission).toBe("warehouse.write") }
    )).resolves.toBe("warehouse.write");

    await expect(updateAdminRecord(
      "inventory_movements",
      "id",
      "11111111-1111-1111-1111-111111111111",
      { notes: "mutate ledger" },
      "00000000-0000-0000-0000-000000000001"
    )).rejects.toThrow("Inventory movement records are immutable.");

    await expect(deleteAdminRecord(
      "inventory_movements",
      "id",
      "11111111-1111-1111-1111-111111111111",
      "00000000-0000-0000-0000-000000000001"
    )).rejects.toThrow("Inventory movement records are immutable.");
  });
});
