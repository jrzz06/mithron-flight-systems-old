import { buildSupabasePublicObjectUrl, MEDIA_VARIANT_WIDTHS } from "@/lib/media/media-url";

export { buildSupabasePublicObjectUrl, MEDIA_VARIANT_WIDTHS } from "@/lib/media/media-url";

const WEBP_QUALITY = {
  thumbnail: 84,
  medium: 90,
  large: 94,
  xlarge: 96,
  ultra: 96
} as const;

type RasterVariantLabel = keyof typeof MEDIA_VARIANT_WIDTHS;

export type OptimizedImageVariant = {
  label: RasterVariantLabel;
  format: "webp";
  mimeType: "image/webp";
  width: number | null;
  height: number | null;
  sizeBytes: number;
  buffer: Buffer;
};

export type StoredOptimizedImageVariant = OptimizedImageVariant & {
  storagePath: string;
  publicUrl: string;
};

const optimizableImageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  // GIF uploads were stored raw with no WebP variants at all. sharp() without
  // `{ animated: true }` decodes only the first frame, so this gives GIFs the
  // same responsive-thumbnail parity as other formats (losing animation, but
  // gaining fast, correctly-sized delivery instead of an unoptimized still).
  "image/gif"
]);

export function isOptimizableImageMimeType(mimeType: string) {
  return optimizableImageMimeTypes.has(mimeType.trim().toLowerCase());
}

export function buildOptimizedVariantStoragePath(
  storagePath: string,
  variant: Pick<OptimizedImageVariant, "label" | "format">
) {
  const basePath = storagePath.replace(/\.[a-z0-9]+$/i, "");
  return `${basePath}.${variant.label}.${variant.format}`;
}

async function loadSharp() {
  // Dynamic import keeps non-media Server Actions off the sharp cold-start path.
  return import("sharp");
}

async function createWebpVariant(
  input: Buffer,
  label: RasterVariantLabel
): Promise<OptimizedImageVariant> {
  const sharp = (await loadSharp()).default;
  const output = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: MEDIA_VARIANT_WIDTHS[label], withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY[label], effort: 6, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });

  return {
    label,
    format: "webp",
    mimeType: "image/webp",
    width: output.info.width ?? null,
    height: output.info.height ?? null,
    sizeBytes: output.data.byteLength,
    buffer: output.data
  };
}

/** Lightweight sync path for request handlers — thumbnail only. */
export async function createOptimizedImageThumbnail(
  input: Buffer,
  mimeType: string
): Promise<OptimizedImageVariant | null> {
  if (!isOptimizableImageMimeType(mimeType)) return null;
  const variant = await createWebpVariant(input, "thumbnail");
  return variant.sizeBytes > 0 ? variant : null;
}

export async function readImageBufferMetadata(buffer: Buffer, mimeType: string) {
  if (!mimeType.startsWith("image/")) {
    return { width: null as number | null, height: null as number | null };
  }
  try {
    const sharp = (await loadSharp()).default;
    const metadata = await sharp(buffer, { failOn: "none" }).metadata();
    return {
      width: typeof metadata.width === "number" ? metadata.width : null,
      height: typeof metadata.height === "number" ? metadata.height : null
    };
  } catch {
    return { width: null as number | null, height: null as number | null };
  }
}

export async function createOptimizedImageVariants(
  input: Buffer,
  mimeType: string,
  options?: { labels?: RasterVariantLabel[] }
): Promise<OptimizedImageVariant[]> {
  if (!isOptimizableImageMimeType(mimeType)) return [];

  const labels = options?.labels ?? (["thumbnail", "medium", "large", "xlarge", "ultra"] as RasterVariantLabel[]);
  const variants = await Promise.all(labels.map((label) => createWebpVariant(input, label)));
  return variants.filter((variant) => variant.sizeBytes > 0);
}

export function selectPrimaryOptimizedVariant(variants: StoredOptimizedImageVariant[]) {
  return variants.find((variant) => variant.label === "ultra" && variant.format === "webp")
    ?? variants.find((variant) => variant.label === "xlarge" && variant.format === "webp")
    ?? variants.find((variant) => variant.label === "large" && variant.format === "webp")
    ?? variants.find((variant) => variant.label === "medium" && variant.format === "webp")
    ?? variants[0]
    ?? null;
}

export function findStoredOptimizedVariant(
  variants: StoredOptimizedImageVariant[],
  label: StoredOptimizedImageVariant["label"],
  format?: StoredOptimizedImageVariant["format"]
) {
  return variants.find((variant) => variant.label === label && (!format || variant.format === format)) ?? null;
}

export function findLargestStoredAvifVariant(variants: StoredOptimizedImageVariant[]): StoredOptimizedImageVariant | null {
  void variants;
  return null;
}

export function buildResponsiveVariantsMetadata(
  variants: StoredOptimizedImageVariant[],
  source: {
    width: number | null;
    height: number | null;
    sizeBytes: number;
    mimeType: string;
    storagePath?: string;
    publicUrl?: string;
    uploadedBytes?: number;
  }
) {
  const variantRecord = Object.fromEntries(
    variants.map((variant) => [
      variant.label,
      {
        format: variant.format,
        mime_type: variant.mimeType,
        storage_path: variant.storagePath,
        public_url: variant.publicUrl,
        width: variant.width,
        height: variant.height,
        size_bytes: variant.sizeBytes
      }
    ])
  );

  return {
    source: {
      width: source.width,
      height: source.height,
      size_bytes: source.sizeBytes,
      mime_type: source.mimeType,
      storage_path: source.storagePath ?? null,
      public_url: source.publicUrl ?? null
    },
    generated: variantRecord,
    optimized_uploaded_bytes: source.uploadedBytes ?? variants.reduce((total, variant) => total + variant.sizeBytes, 0),
    strategy: "original-primary-plus-premium-responsive-webp-q96"
  };
}
