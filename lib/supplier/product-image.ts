import {
  buildProductGalleryMedia,
  parseGalleryUrls,
  parseOrderedGalleryUrls,
  parseRemovedGalleryUrls,
  readProductGalleryFromRow
} from "@/lib/product-gallery";
import { sanitizeProductImageSrc } from "@/lib/media/sanitize-product-image-src";
import {
  uploadProductImagesForDraft,
  type UploadedProductImage
} from "@/services/product-image-upload";

type JsonRecord = Record<string, unknown>;

export function readProductImageSrc(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const src = (value as JsonRecord).src;
  return sanitizeProductImageSrc(typeof src === "string" ? src : "") ?? "";
}

export function buildProductMediaFromSrc(src: string, alt: string) {
  const sanitized = sanitizeProductImageSrc(src);
  if (!sanitized) {
    throw new Error("Add a product image by uploading a file or pasting a valid image URL.");
  }
  const media = { src: sanitized, alt, kind: "image", priority: true };
  return {
    image: media,
    hero: media,
    gallery: [media]
  };
}

export async function resolveSupplierProductImageFields(
  formData: FormData,
  input: {
    slug: string;
    name: string;
    actorId: string;
    existingImageSrc?: string;
    existingProductRow?: unknown;
    requireImage?: boolean;
  }
): Promise<{
  image: JsonRecord;
  hero: JsonRecord;
  gallery: JsonRecord[];
  uploadedImages: UploadedProductImage[];
}> {
  const uploadedImages = await uploadProductImagesForDraft(formData, input.actorId, "supplier-product-create");
  const imageSrc =
    sanitizeProductImageSrc(String(formData.get("image_src") ?? ""))
    ?? sanitizeProductImageSrc(input.existingImageSrc)
    ?? "";
  const extraUrls = parseGalleryUrls(formData);
  const orderedUrls = parseOrderedGalleryUrls(formData);
  const removedUrls = parseRemovedGalleryUrls(formData);
  const existingGallery = input.existingProductRow
    ? readProductGalleryFromRow(input.existingProductRow)
    : [];
  const alt = String(formData.get("image_alt") ?? "").trim() || input.name;

  if (
    !imageSrc
    && !uploadedImages.length
    && !extraUrls.length
    && !orderedUrls.length
    && input.requireImage !== false
  ) {
    throw new Error("Add a product image by uploading a file or pasting an image URL.");
  }

  const merged = buildProductGalleryMedia({
    primarySrc: imageSrc,
    primaryAlt: alt,
    uploadedUrls: uploadedImages
      .map((upload) => sanitizeProductImageSrc(upload.publicUrl))
      .filter((url): url is string => Boolean(url)),
    extraUrls,
    existingGallery,
    removedUrls,
    orderedUrls
  });

  if (!merged) {
    if (input.requireImage === false && sanitizeProductImageSrc(input.existingImageSrc)) {
      const fallback = buildProductMediaFromSrc(String(input.existingImageSrc), alt);
      return { ...fallback, uploadedImages };
    }
    throw new Error("Add a product image by uploading a file or pasting a valid image URL.");
  }

  return { ...merged, uploadedImages };
}
