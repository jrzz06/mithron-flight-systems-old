import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildProductGalleryMedia,
  dedupeGalleryBySrc,
  parseGalleryUrls,
  parseRemovedGalleryUrls
} from "@/lib/product-gallery";
import {
  MAX_PRODUCT_IMAGE_COUNT,
  PREFERRED_PRODUCT_IMAGE_BYTES,
  RECOMMENDED_PRODUCT_IMAGE_HEIGHT,
  RECOMMENDED_PRODUCT_IMAGE_WIDTH,
  productImageUploadNotice
} from "@/lib/product-image-limits";
import { collectProductImageUploadFiles } from "@/services/product-image-upload";

function mockFile(name: string, size = 1024, lastModified = 1) {
  const file = new File(["x"], name, { type: "image/png" });
  Object.defineProperty(file, "size", { value: size });
  Object.defineProperty(file, "lastModified", { value: lastModified });
  return file;
}

describe("product multi-image upload helpers", () => {
  it("collects image_files and legacy image_file without duplicates", () => {
    const formData = new FormData();
    formData.append("image_files", mockFile("a.png", 10, 1));
    formData.append("image_files", mockFile("b.png", 20, 2));
    formData.append("image_file", mockFile("legacy.png", 30, 3));

    const files = collectProductImageUploadFiles(formData);
    expect(files).toHaveLength(3);
    expect(files.map((file) => file.name)).toEqual(["a.png", "b.png", "legacy.png"]);
  });

  it("dedupes identical files in image_files and legacy image_file", () => {
    const formData = new FormData();
    const file = mockFile("same.png", 10, 99);
    formData.append("image_files", file);
    formData.append("image_file", file);

    expect(collectProductImageUploadFiles(formData)).toHaveLength(1);
  });

  it("parses gallery_urls from newlines and commas", () => {
    const formData = new FormData();
    formData.set("gallery_urls", "https://example.com/one.jpg\nhttps://example.com/two.jpg, https://example.com/three.jpg");
    expect(parseGalleryUrls(formData)).toEqual([
      "https://example.com/one.jpg",
      "https://example.com/two.jpg",
      "https://example.com/three.jpg"
    ]);
  });

  it("builds gallery media from uploads and extra urls on create", () => {
    const media = buildProductGalleryMedia({
      primarySrc: "",
      primaryAlt: "Agri drone",
      uploadedUrls: ["https://cdn.example.com/primary.webp", "https://cdn.example.com/second.webp"],
      extraUrls: ["https://cdn.example.com/third.webp", "https://cdn.example.com/second.webp"]
    });

    expect(media?.image.src).toBe("https://cdn.example.com/primary.webp");
    expect(media?.gallery.map((item) => item.src)).toEqual([
      "https://cdn.example.com/primary.webp",
      "https://cdn.example.com/second.webp",
      "https://cdn.example.com/third.webp"
    ]);
  });

  it("appends new uploads to existing gallery on edit without wiping prior images", () => {
    const existingGallery = [
      { src: "https://cdn.example.com/old.webp", alt: "Old", kind: "image" }
    ];
    const media = buildProductGalleryMedia({
      primarySrc: "https://cdn.example.com/old.webp",
      primaryAlt: "Agri drone",
      uploadedUrls: ["https://cdn.example.com/new-primary.webp"],
      extraUrls: [],
      existingGallery
    });

    expect(media?.image.src).toBe("https://cdn.example.com/new-primary.webp");
    expect(media?.gallery.map((item) => item.src)).toEqual([
      "https://cdn.example.com/new-primary.webp",
      "https://cdn.example.com/old.webp"
    ]);
  });

  it("removes selected gallery images and promotes the next image to primary", () => {
    const existingGallery = [
      { src: "https://cdn.example.com/primary.webp", alt: "Primary", kind: "image", priority: true },
      { src: "https://cdn.example.com/second.webp", alt: "Second", kind: "image" },
      { src: "https://cdn.example.com/third.webp", alt: "Third", kind: "image" }
    ];
    const media = buildProductGalleryMedia({
      primarySrc: "https://cdn.example.com/primary.webp",
      primaryAlt: "Agri drone",
      uploadedUrls: [],
      extraUrls: [],
      existingGallery,
      removedUrls: ["https://cdn.example.com/primary.webp", "https://cdn.example.com/third.webp"]
    });

    expect(media?.image.src).toBe("https://cdn.example.com/second.webp");
    expect(media?.gallery.map((item) => item.src)).toEqual([
      "https://cdn.example.com/second.webp"
    ]);
  });

  it("parses removed_gallery_urls from form data", () => {
    const formData = new FormData();
    formData.append("removed_gallery_urls", "https://cdn.example.com/a.webp");
    formData.append("removed_gallery_urls", "https://cdn.example.com/b.webp");
    expect(parseRemovedGalleryUrls(formData)).toEqual([
      "https://cdn.example.com/a.webp",
      "https://cdn.example.com/b.webp"
    ]);
  });

  it("dedupes gallery items by src", () => {
    const deduped = dedupeGalleryBySrc([
      { src: "https://cdn.example.com/a.webp", alt: "A" },
      { src: "https://cdn.example.com/a.webp", alt: "A duplicate" },
      { src: "https://cdn.example.com/b.webp", alt: "B" }
    ]);

    expect(deduped).toHaveLength(2);
  });

  it("documents max image count and recommended preview size", () => {
    expect(MAX_PRODUCT_IMAGE_COUNT).toBe(8);
    expect(RECOMMENDED_PRODUCT_IMAGE_WIDTH).toBe(1000);
    expect(RECOMMENDED_PRODUCT_IMAGE_HEIGHT).toBe(1000);
    expect(PREFERRED_PRODUCT_IMAGE_BYTES).toBe(2 * 1024 * 1024);
    expect(productImageUploadNotice()).toContain("1000×1000");
    expect(productImageUploadNotice()).toContain("2 MB");
  });

  it("ships multi-image fields in admin and supplier forms", () => {
    const adminPage = readFileSync(join(process.cwd(), "app/admin/products/page.tsx"), "utf8");
    const adminQuickEdit = readFileSync(join(process.cwd(), "app/admin/products/product-detail-edit-dialog.tsx"), "utf8");
    const adminActions = readFileSync(join(process.cwd(), "app/admin/products/actions.ts"), "utf8");
    const supplierField = readFileSync(join(process.cwd(), "components/supplier/supplier-product-image-field.tsx"), "utf8");
    const supplierActions = readFileSync(join(process.cwd(), "app/supplier/products/actions.ts"), "utf8");
    const multiField = readFileSync(join(process.cwd(), "components/products/product-multi-image-field.tsx"), "utf8");
    const fileInput = readFileSync(join(process.cwd(), "components/products/product-image-file-input.tsx"), "utf8");
    const richText = readFileSync(join(process.cwd(), "components/editor/RichTextEditor/index.tsx"), "utf8");

    expect(adminPage).toContain("ProductMultiImageField");
    expect(adminPage).toContain("action={saveProductDraftFormAction}");
    expect(adminPage).not.toContain('encType="multipart/form-data"');
    expect(adminQuickEdit).toContain("ProductMultiImageField");
    expect(adminQuickEdit).toContain("action={saveProductQuickEditFormAction}");
    expect(adminQuickEdit).not.toContain('encType="multipart/form-data"');
    expect(adminActions).toContain("admin-product-quick-edit");
    expect(multiField).toContain("ProductImageFileInput");
    expect(multiField).toContain("productImageUploadNotice");
    expect(multiField).toContain('name="removed_gallery_urls"');
    expect(multiField).toContain("galleryItems");
    expect(fileInput).toContain("data-product-image-selection-meta");
    expect(supplierField).toContain("ProductMultiImageField");
    expect(supplierActions).toContain("linkUploadedImagesToProduct");
    expect(supplierActions).toContain("uploadedImages");
    expect(supplierActions).toContain("readSupplierProductDescriptionFields");
    expect(richText).toMatch(/if \(!editor\)[\s\S]*name=\{name\}[\s\S]*jsonName/);
  });
});
