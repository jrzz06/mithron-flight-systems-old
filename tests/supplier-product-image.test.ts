import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildProductMediaFromSrc, readProductImageSrc } from "@/lib/supplier/product-image";

describe("supplier product image helpers", () => {
  it("reads image src from product json", () => {
    expect(readProductImageSrc({ src: "/media/test.webp", alt: "Test" })).toBe("/media/test.webp");
    expect(readProductImageSrc(null)).toBe("");
  });

  it("builds image, hero, and gallery from a single src", () => {
    expect(buildProductMediaFromSrc("/media/test.webp", "Agri drone")).toEqual({
      image: { src: "/media/test.webp", alt: "Agri drone", kind: "image", priority: true },
      hero: { src: "/media/test.webp", alt: "Agri drone", kind: "image", priority: true },
      gallery: [{ src: "/media/test.webp", alt: "Agri drone", kind: "image", priority: true }]
    });
  });

  it("ships image fields on supplier create and edit forms", () => {
    const createForm = readFileSync(join(process.cwd(), "components/supplier/supplier-new-product-form.tsx"), "utf8");
    const editForm = readFileSync(join(process.cwd(), "components/supplier/supplier-edit-product-form.tsx"), "utf8");
    const actions = readFileSync(join(process.cwd(), "app/supplier/products/actions.ts"), "utf8");

    expect(createForm).toContain("SupplierProductImageField");
    expect(createForm).toContain("action={formAction}");
    expect(createForm).not.toContain('encType="multipart/form-data"');
    expect(editForm).not.toContain('encType="multipart/form-data"');
    expect(readFileSync(join(process.cwd(), "components/products/product-multi-image-field.tsx"), "utf8")).toContain('name="image_src"');
    expect(readFileSync(join(process.cwd(), "components/products/product-image-file-input.tsx"), "utf8")).toContain('name="image_files"');
    expect(readFileSync(join(process.cwd(), "components/products/product-multi-image-field.tsx"), "utf8")).toContain("ProductImageFileInput");
    expect(editForm).toContain("SupplierProductImageField");
    expect(actions).toContain("resolveSupplierProductImageFields");
    expect(actions).toContain("linkUploadedImagesToProduct");
  });
});
