import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("admin order enrichment", () => {
  it("exports order enrichment workflows", () => {
    const workflow = source("services/order-workflow.ts");
    expect(workflow).toContain("export async function updateOrderShippingAddressWorkflow");
    expect(workflow).toContain("export async function addOrderItemsToOrderWorkflow");
    expect(workflow).toContain("needs_address: false");
    expect(workflow).toContain("needs_products: false");
    expect(workflow).toContain("order.ready_for_payment");
  });

  it("exposes admin form actions for address and products", () => {
    const actions = source("app/admin/orders/actions.ts");
    expect(actions).toContain("export async function updateOrderShippingAddressFormAction");
    expect(actions).toContain("export async function addOrderItemsFormAction");
    expect(actions).toContain('requireAdminPermission("orders.write")');
    expect(actions).toContain("updateOrderShippingAddressWorkflow");
    expect(actions).toContain("addOrderItemsToOrderWorkflow");
  });

  it("parses enrichment form payloads", () => {
    const forms = source("services/enterprise-admin-forms.ts");
    expect(forms).toContain("export function buildOrderShippingAddressUpdateFromFormData");
    expect(forms).toContain("export function buildAddOrderItemsFromFormData");
  });

  it("wires enrichment actions through the orders workspace", () => {
    const workspace = source("components/admin/admin-orders-workspace.tsx");
    const detail = source("components/admin/orders/admin-order-detail.tsx");
    const shipping = source("components/admin/orders/admin-order-shipping-section.tsx");
    const products = source("components/admin/orders/admin-order-products-section.tsx");

    expect(workspace).toContain("updateOrderShippingAddressAction");
    expect(workspace).toContain("addOrderItemsAction");
    expect(detail).toContain("updateOrderShippingAddressAction");
    expect(detail).toContain("addOrderItemsAction");
    expect(shipping).toContain("updateShippingAddressAction");
    expect(shipping).toContain("runOrderFormActionWithConflictRetry");
    expect(shipping).toContain("shippingFormDefaults");
    expect(shipping).toContain("patchOrder");
    expect(products).toContain("addOrderItemsAction");
  });
});
