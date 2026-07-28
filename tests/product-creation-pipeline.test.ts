import { describe, expect, it } from "vitest";
import { sanitizeProductImageSrc, sanitizeProductImageSrcList } from "@/lib/media/sanitize-product-image-src";
import { resolveNextImageSrc } from "@/lib/media/next-image-src";
import { parseSupplierProductForm } from "@/lib/supplier/product-form";

describe("sanitizeProductImageSrc", () => {
  it("rejects empty, slash-only, and garbage placeholders", () => {
    expect(sanitizeProductImageSrc("")).toBeNull();
    expect(sanitizeProductImageSrc("/")).toBeNull();
    expect(sanitizeProductImageSrc("#")).toBeNull();
    expect(sanitizeProductImageSrc("null")).toBeNull();
    expect(sanitizeProductImageSrc("blob:http://localhost/abc")).toBeNull();
  });

  it("keeps relative media paths and https image URLs", () => {
    expect(sanitizeProductImageSrc("/media/mithron/products/agri.webp")).toBe(
      "/media/mithron/products/agri.webp"
    );
    expect(
      sanitizeProductImageSrc("https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/bucket/a.jpg")
    ).toContain("/storage/v1/object/public/");
  });

  it("dedupes sanitized lists", () => {
    expect(
      sanitizeProductImageSrcList(["/", "/media/a.webp", "/media/a.webp", "https://example.com/"])
    ).toEqual(["/media/a.webp"]);
  });
});

describe("resolveNextImageSrc", () => {
  it("never returns bare slash for next/image", () => {
    expect(resolveNextImageSrc("/")).toBeNull();
    expect(resolveNextImageSrc("")).toBeNull();
  });
});

describe("parseSupplierProductForm", () => {
  it("maps category dropdown label into canonical category payload", () => {
    const formData = new FormData();
    formData.set("name", "Field spray kit");
    formData.set("category", "Agri Drones");
    formData.set("price", "49999");
    expect(parseSupplierProductForm(formData)).toMatchObject({
      name: "Field spray kit",
      category: "Agri Drones",
      price: 49999
    });
  });
});
