import { describe, expect, it } from "vitest";
import { inferProductTaxGroup, resolveProductTaxRate } from "@/lib/product-tax-groups";

describe("product tax groups", () => {
  it("maps agri drone categories to the reduced GST group", () => {
    expect(inferProductTaxGroup("Agri Drones", "Agri Kisan Drone Medium - 10 Liter")).toBe("agri-drones");
  });

  it("maps agri accessories separately from general accessories", () => {
    expect(inferProductTaxGroup("Accessories", "V9 Flight Controller for Agriculture Drones")).toBe("agri-accessories");
    expect(inferProductTaxGroup("Accessories", "GNSS RECEIVER RS2+WITH TRIPOD & TRIBRACH")).toBe("non-agri-accessories");
  });

  it("resolves GST rate from the selected tax group", () => {
    expect(resolveProductTaxRate({ taxGroup: "agri-drones", chargeTax: true })).toBe(5);
    expect(resolveProductTaxRate({ taxGroup: "agri-accessories", chargeTax: true })).toBe(12);
    expect(resolveProductTaxRate({ taxGroup: "non-agri-drones", chargeTax: true })).toBe(18);
    expect(resolveProductTaxRate({ taxGroup: "products-default", chargeTax: false })).toBe(0);
  });
});
