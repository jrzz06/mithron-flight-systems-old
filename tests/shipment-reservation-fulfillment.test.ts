import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("shipment fulfillment inventory", () => {
  it("does not deduct stock during shipment creation", () => {
    const shipments = source("services/shipments.ts");
    expect(shipments).not.toContain("fulfillReservedStock");
    expect(shipments).not.toContain("orderHasCheckoutReservations");
  });

  it("defines reservation probe and atomic inventory adjustment RPCs", () => {
    const migration = source("supabase/migrations/20260622160000_inventory_adjustment_rpc.sql");
    expect(migration).toContain("order_has_checkout_reservations");
    expect(migration).toContain("apply_inventory_adjustment");
    expect(migration).toContain("for update");
  });

  it("routes manual warehouse adjustments through the inventory RPC", () => {
    const movements = source("services/warehouse-movements.ts");
    expect(movements).toContain("apply_inventory_adjustment");
    expect(movements).toContain("applyInventoryAdjustmentRpc");
    expect(movements).toContain("expectedUpdatedAt?: string | null");
  });

  it("deducts inventory on warehouse fulfillment lifecycle updates", () => {
    const actions = source("app/warehouse/actions.ts");
    expect(actions).toContain("applyFulfillmentStockMovements");
    expect(actions).not.toContain("reserveCheckoutStock");
  });
});
