import { describe, expect, it } from "vitest";
import { buildOrdersExportCsv, ordersExportFileName } from "@/services/orders-export";

describe("orders export helpers", () => {
  it("builds a denormalized orders CSV with invoice and shipment columns", () => {
    const orderId = "order-1";
    const csv = buildOrdersExportCsv(
      [
        {
          id: orderId,
          order_number: "ORD-1001",
          customer_email: "buyer@example.com",
          status: "dispatched",
          payment_status: "succeeded",
          fulfillment_status: "shipped",
          subtotal: 900,
          total: 1000,
          currency: "INR",
          metadata: {
            customer_full_name: "Buyer Name",
            customer_phone: "+91 90000 00000",
            shipping_amount: 100,
            discount_amount: 0,
            shipping_address: {
              line1: "12 Main Street",
              city: "Bengaluru",
              region: "KA",
              postal_code: "560001",
              country: "India"
            },
            assigned_warehouse_code: "BLR-01"
          },
          invoice_url: "/account/orders/order-1/invoice",
          created_at: "2026-07-01T10:00:00.000Z",
          updated_at: "2026-07-02T12:00:00.000Z"
        }
      ],
      [
        {
          order_id: orderId,
          product_name: "Drone X",
          product_slug: "drone-x",
          sku: "DRN-X",
          quantity: 2
        }
      ],
      [
        {
          order_id: orderId,
          shipment_status: "shipped",
          carrier_name: "BlueDart",
          tracking_number: "BD123",
          updated_at: "2026-07-02T11:00:00.000Z"
        }
      ],
      new Map([[orderId, "INV-2026-0001"]]),
      "BLR-01"
    );

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("order_number,order_date,customer_name,customer_email");
    expect(csv).toContain("ORD-1001");
    expect(csv).toContain("Buyer Name");
    expect(csv).toContain("Drone X");
    expect(csv).toContain("DRN-X,2,");
    expect(csv).toContain("shipped");
    expect(csv).toContain("BlueDart");
    expect(csv).toContain("INV-2026-0001");
    expect(csv).toContain("12 Main Street");
  });

  it("names export files by date", () => {
    expect(ordersExportFileName(new Date("2026-07-10T00:00:00.000Z"))).toBe("mithron-orders-2026-07-10.csv");
  });
});
