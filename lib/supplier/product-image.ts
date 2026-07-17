import {
  buildProductGalleryMedia,
  parseGalleryUrls,
  readProductGalleryFromRow
} from "@/lib/product-gallery";
import {
  uploadProductImagesForDraft,
  type UploadedProductImage
} from "@/services/product-image-upload";

type JsonRecord = Record<string, unknown>;

export function readProductImageSrc(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const src = (value as JsonRecord).src;
  return typeof src === "string" && src.trim() ? src.trim() : "";
}

export function buildProductMediaFromSrc(src: string, alt: string) {
  const media = { src, alt, kind: "image", priority: true };
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
  const imageSrc = String(formData.get("image_src") ?? "").trim() || input.existingImageSrc?.trim() || "";
  const extraUrls = parseGalleryUrls(formData);
  const existingGallery = input.existingProductRow
    ? readProductGalleryFromRow(input.existingProductRow)
    : [];
  const alt = String(formData.get("image_alt") ?? "").trim() || input.name;

  if (!imageSrc && !uploadedImages.length && !extraUrls.length && input.requireImage !== false) {
    throw new Error("Add a product image by uploading a file or pasting an image URL.");
  }

  const merged = buildProductGalleryMedia({
    primarySrc: imageSrc,
    primaryAlt: alt,
    uploadedUrls: uploadedImages.map((upload) => upload.publicUrl),
    extraUrls,
    existingGallery: uploadedImages.length ? existingGallery : existingGallery
  });

  if (!merged) {
    if (input.requireImage === false && input.existingImageSrc) {
      const fallback = buildProductMediaFromSrc(input.existingImageSrc, alt);
      return { ...fallback, uploadedImages };
    }
    const fallback = buildProductMediaFromSrc("/media/mithron/hero/ag10-command.webp", input.name);
    return { ...fallback, uploadedImages };
  }

  return { ...merged, uploadedImages };
}
