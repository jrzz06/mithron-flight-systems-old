import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveOrderFulfillmentStatusFromShipments,
  validateShipmentItemsAgainstOrder
} from "@/services/shipments";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("shipment workflow hardening", () => {
  it("rolls back failed shipment creation with compensating stock restore", () => {
    const shipments = source("services/shipments.ts");
    expect(shipments).toContain("cancelShipmentAndRestoreStock");
    expect(shipments).toContain("shipment_create_rollback");
    expect(shipments).toContain("stockDeductions.push");
    expect(shipments).toMatch(/for \(const deduction of stockDeductions\)/);
  });

  it("restores shipment stock before persisting returned or cancelled status", () => {
    const shipments = source("services/shipments.ts");
    const updateStart = shipments.indexOf("export async function updateShipmentWorkflow");
    const updateBody = shipments.slice(updateStart);
    const restoreIndex = updateBody.indexOf("await restoreShipmentStock");
    const persistIndex = updateBody.indexOf("await updateShipmentRecord");
    expect(restoreIndex).toBeGreaterThan(-1);
    expect(persistIndex).toBeGreaterThan(-1);
    expect(restoreIndex).toBeLessThan(persistIndex);
  });

  it("rejects shipment quantities above remaining order quantity", () => {
    expect(() => validateShipmentItemsAgainstOrder(
      [{ id: "oi-1", product_slug: "drone-a", quantity: 2 }],
      [{ order_item_id: "oi-1", quantity: 1 }],
      [{ orderItemId: "oi-1", productId: "drone-a", variantId: null, quantity: 2 }]
    )).toThrow(/exceeds remaining order quantity/i);
  });

  it("derives cancelled fulfillment when any shipment failed", () => {
    expect(deriveOrderFulfillmentStatusFromShipments(
      [{ quantity: 1 }],
      [{ quantity: 1 }],
      [{ shipment_status: "failed" }]
    )).toBe("cancelled");
  });

  it("derives processing when shipped quantity is partial", () => {
    expect(deriveOrderFulfillmentStatusFromShipments(
      [{ quantity: 3 }],
      [{ quantity: 1 }],
      [{ shipment_status: "packed" }]
    )).toBe("processing");
  });

  it("allows shipment creation for admin-released unpaid orders", () => {
    const shipments = source("services/shipments.ts");
    expect(shipments).toContain("isAdminWarehouseReleased");
    expect(shipments).toMatch(/!isAdminWarehouseReleased\(order\) && !shippablePaymentStatuses\.has\(paymentStatus\)/);
  });
});
