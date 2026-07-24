export const MAX_PRODUCT_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_PRODUCT_IMAGE_COUNT = 8;

/** Square product preview size matching catalog/shelf cards. */
export const RECOMMENDED_PRODUCT_IMAGE_WIDTH = 1000;
export const RECOMMENDED_PRODUCT_IMAGE_HEIGHT = 1000;

/** Soft guidance for faster loading; hard reject still uses MAX_PRODUCT_IMAGE_BYTES. */
export const PREFERRED_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;

export function formatProductImageBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function productImageUploadNotice() {
  const maxMb = Math.round(MAX_PRODUCT_IMAGE_BYTES / (1024 * 1024));
  const preferredMb = Math.round(PREFERRED_PRODUCT_IMAGE_BYTES / (1024 * 1024));
  return [
    `Recommended: ${RECOMMENDED_PRODUCT_IMAGE_WIDTH}×${RECOMMENDED_PRODUCT_IMAGE_HEIGHT} px (1:1) for a clean product preview.`,
    `Prefer files under ${preferredMb} MB for faster loading (max ${maxMb} MB each, up to ${MAX_PRODUCT_IMAGE_COUNT} images).`,
    "Drag or move images to reorder — the first image is primary. The first selected upload becomes primary on save."
  ].join(" ");
}
