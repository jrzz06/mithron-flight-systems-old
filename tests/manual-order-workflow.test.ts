import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildManualOrderInputFromFormData } from "@/services/enterprise-admin-forms";
import { dedupeManualOrderItems, mapPaymentMethodToStatus } from "@/services/manual-order";
import { generateCustomerOrderNumber } from "@/lib/orders/order-number";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("manual order workflow", () => {
  it("maps payment methods to order status and payment status", () => {
    expect(mapPaymentMethodToStatus("pending_payment")).toMatchObject({
      status: "pending_payment",
      paymentStatus: "requires_payment",
      recordPayment: false
    });
    expect(mapPaymentMethodToStatus("paid")).toMatchObject({
      status: "confirmed",
      paymentStatus: "succeeded",
      recordPayment: true
    });
    expect(mapPaymentMethodToStatus("cod")).toMatchObject({
      status: "confirmed",
      paymentStatus: "requires_payment",
      recordPayment: false
    });
    expect(mapPaymentMethodToStatus("bank_transfer")).toMatchObject({
      status: "confirmed",
      paymentStatus: "succeeded",
      recordPayment: true
    });
    expect(mapPaymentMethodToStatus("manual")).toMatchObject({
      status: "confirmed",
      paymentStatus: "succeeded",
      recordPayment: true
    });
    expect(mapPaymentMethodToStatus("not_required")).toMatchObject({
      status: "confirmed",
      paymentStatus: "not_required",
      recordPayment: false
    });
  });

  it("generates customer-facing order numbers instead of UUIDs", () => {
    const orderNumber = generateCustomerOrderNumber(new Date("2026-06-26T12:00:00.000Z"));
    expect(orderNumber).toMatch(/^ORD-\d{8}-[A-Z0-9]{5}$/);
    expect(orderNumber).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it("rejects duplicate slug and sku combinations", () => {
    expect(() => dedupeManualOrderItems([
      { productSlug: "drone-a", quantity: 1, sku: "SKU-1" },
      { productSlug: "drone-a", quantity: 2, sku: "SKU-1" }
    ])).toThrow(/Duplicate product/);
  });

  it("builds manual order workflow input from admin form fields", () => {
    const input = buildManualOrderInputFromFormData(formData({
      customer_email: "buyer@example.com",
      customer_phone: "+919999999999",
      customer_full_name: "Buyer Example",
      create_customer: "1",
      shipping_line1: "12 Field Lane",
      shipping_city: "Pune",
      shipping_region: "Maharashtra",
      shipping_postal_code: "411001",
      shipping_country: "India",
      billing_same_as_shipping: "1",
      order_items: "[{\"productSlug\":\"source-agri-kisan-drone-small-8-liter\",\"quantity\":2}]",
      payment_method: "paid",
      shipping_amount: "150",
      discount_amount: "50",
      warehouse_code: "WH-MAIN",
      customer_note: "Call before delivery",
      internal_note: "Admin manual capture",
      idempotency_key: "manual-order-1"
    }));

    expect(input).toMatchObject({
      email: "buyer@example.com",
      phone: "+919999999999",
      fullName: "Buyer Example",
      createAccountIfMissing: true,
      paymentMethod: "paid",
      shippingAmount: 150,
      discountAmount: 50,
      warehouseCode: "WH-MAIN",
      customerNote: "Call before delivery",
      internalNote: "Admin manual capture",
      idempotencyKey: "manual-order-1",
      items: [{ productSlug: "source-agri-kisan-drone-small-8-liter", quantity: 2 }]
    });
    expect(input.shippingAddress.line1).toBe("12 Field Lane");
    expect(input.billingSameAsShipping).toBe(true);
  });

  it("exposes create-order anchor and product picker markers in admin orders UI", () => {
    const adminOrdersPage = readFileSync(join(process.cwd(), "app/admin/orders/page.tsx"), "utf8");
    const adminOrdersWorkspace = readFileSync(join(process.cwd(), "components/admin/admin-orders-workspace.tsx"), "utf8");
    const manualOrderPanel = readFileSync(join(process.cwd(), "components/admin/manual-order-create-panel.tsx"), "utf8");
    const ui = `${adminOrdersPage}\n${adminOrdersWorkspace}\n${manualOrderPanel}`;

    expect(ui).toContain('id="create-order"');
    expect(ui).toContain("data-order-product-picker");
    expect(adminOrdersPage).toContain("createAdminManualOrderFormAction");
    expect(adminOrdersWorkspace).toContain("ManualOrderCreatePanel");
  });

  it("uses shared checkout persistence services in manual order orchestration", () => {
    const manualOrderService = readFileSync(join(process.cwd(), "services/manual-order.ts"), "utf8");

    expect(manualOrderService).not.toContain("reserveCheckoutStock");
    expect(manualOrderService).toContain("createOrderRecord");
    expect(manualOrderService).not.toContain("insert into orders");
  });
});
