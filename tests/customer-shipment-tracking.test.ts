import { describe, expect, it } from "vitest";
import { parseShipmentTracking } from "@/lib/customer/shipment-tracking";

describe("parseShipmentTracking", () => {
  it("reads carrier and tracking_number from objects", () => {
    expect(parseShipmentTracking({
      carrier: "Mithron Field",
      tracking_number: "MTH-100"
    })).toEqual({
      carrier: "Mithron Field",
      trackingNumber: "MTH-100",
      trackingUrl: null
    });
  });

  it("parses JSON strings and legacy tracking keys", () => {
    expect(parseShipmentTracking("{\"carrier\":\"Mithron Field\",\"tracking\":\"MTH-100\"}")).toEqual({
      carrier: "Mithron Field",
      trackingNumber: "MTH-100",
      trackingUrl: null
    });
  });

  it("reads carrier_name and tracking_url aliases", () => {
    expect(parseShipmentTracking({
      carrier_name: "BlueDart",
      tracking_url: "https://example.com/track/BD123"
    })).toEqual({
      carrier: "BlueDart",
      trackingNumber: null,
      trackingUrl: "https://example.com/track/BD123"
    });
  });

  it("returns null for empty tracking payloads", () => {
    expect(parseShipmentTracking(null)).toBeNull();
    expect(parseShipmentTracking({})).toBeNull();
    expect(parseShipmentTracking("")).toBeNull();
  });
});
