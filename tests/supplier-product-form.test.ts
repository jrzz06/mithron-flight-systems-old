import { describe, expect, it } from "vitest";
import { parseProductPrice, parseSupplierProductForm, resolveProductSlug } from "@/lib/supplier/product-form";

describe("supplier product form parsing", () => {
  it("auto-generates a slug from the product name", () => {
    expect(resolveProductSlug("Agri Spray Drone")).toBe("agri-spray-drone");
    expect(resolveProductSlug("தமிழ் பொருள்")).toMatch(/^product-/);
  });

  it("parses INR prices with commas and currency symbols", () => {
    expect(parseProductPrice("49999")).toBe(49999);
    expect(parseProductPrice("49,999")).toBe(49999);
    expect(parseProductPrice("₹ 1250.50")).toBe(1250.5);
    expect(parseProductPrice("$1,250.50")).toBe(1250.5);
    expect(parseProductPrice("")).toBeNaN();
  });

  it("returns field-specific validation errors", () => {
    expect(() => parseSupplierProductForm(new FormData())).toThrow("Product name is required.");

    const missingPrice = new FormData();
    missingPrice.set("name", "Spray Drone");
    expect(() => parseSupplierProductForm(missingPrice)).toThrow("Enter a valid price in INR greater than 0.");

    const valid = new FormData();
    valid.set("name", "Spray Drone");
    valid.set("price", "120000");
    expect(parseSupplierProductForm(valid)).toMatchObject({
      name: "Spray Drone",
      slug: "spray-drone",
      price: 120000
    });
    expect(parseSupplierProductForm(valid)).not.toHaveProperty("tagline");
  });
});
