/**
 * Shared thumbnail/medium generation for ai-cutout masters.
 * Matches admin upload sizing (media-optimization.ts) — ADD only, never deletes masters.
 */
import sharp from "sharp";

export const BUCKET = "mithron-products";

const VARIANT_WIDTHS = {
  thumbnail: 320,
  medium: 960,
};

const WEBP_QUALITY = {
  thumbnail: 84,
  medium: 90,
};

const LABELS = /** @type {const} */ (["thumbnail", "medium"]);

export function buildVariantStoragePath(storagePath, label) {
  return storagePath.replace(/\.[a-z0-9]+$/i, "") + `.${label}.webp`;
}

export function publicUrlFor(urlBase, storagePath) {
  return `${urlBase.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

/**
 * @param {Buffer} input
 * @returns {Promise<Array<{ label: string, format: string, mimeType: string, width: number|null, height: number|null, sizeBytes: number, buffer: Buffer }>>}
 */
export async function createCutoutVariants(input) {
  const out = [];
  for (const label of LABELS) {
    const result = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({ width: VARIANT_WIDTHS[label], withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY[label], effort: 6, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
    if (!result.data.byteLength) continue;
    out.push({
      label,
      format: "webp",
      mimeType: "image/webp",
      width: result.info.width ?? null,
      height: result.info.height ?? null,
      sizeBytes: result.data.byteLength,
      buffer: result.data,
    });
  }
  return out;
}

/**
 * @param {Array<{ label: string, format: string, mimeType: string, storagePath: string, publicUrl: string, width: number|null, height: number|null, sizeBytes: number }>} variants
 * @param {{ width: number|null, height: number|null, sizeBytes: number, mimeType: string, storagePath?: string, publicUrl?: string }} source
 */
export function buildResponsiveVariantsMetadata(variants, source) {
  const generated = Object.fromEntries(
    variants.map((variant) => [
      variant.label,
      {
        format: variant.format,
        mime_type: variant.mimeType,
        storage_path: variant.storagePath,
        public_url: variant.publicUrl,
        width: variant.width,
        height: variant.height,
        size_bytes: variant.sizeBytes,
      },
    ])
  );

  return {
    source: {
      width: source.width,
      height: source.height,
      size_bytes: source.sizeBytes,
      mime_type: source.mimeType,
      storage_path: source.storagePath ?? null,
      public_url: source.publicUrl ?? null,
    },
    generated,
    optimized_uploaded_bytes: variants.reduce((total, v) => total + v.sizeBytes, 0),
    strategy: "ai-cutout-thumbnail-medium-webp",
  };
}

export function hasGeneratedVariants(responsiveVariants) {
  if (!responsiveVariants || typeof responsiveVariants !== "object") return false;
  const generated = responsiveVariants.generated;
  if (!generated || typeof generated !== "object") return false;
  return Boolean(generated.thumbnail?.public_url || generated.medium?.public_url);
}

/**
 * Upload thumbnail + medium beside master. Does not delete anything.
 * @returns {{ variants: object[], responsiveVariants: object, keepPaths: string[] }}
 */
export async function uploadCutoutVariants(supabase, urlBase, {
  masterStoragePath,
  masterBuf,
  masterWidth,
  masterHeight,
  masterPublicUrl,
}) {
  const created = await createCutoutVariants(masterBuf);
  if (!created.length) {
    throw new Error(`No variants produced for ${masterStoragePath}`);
  }

  const stored = [];
  for (const variant of created) {
    const storagePath = buildVariantStoragePath(masterStoragePath, variant.label);
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, variant.buffer, {
      contentType: variant.mimeType,
      upsert: true,
    });
    if (error) throw new Error(`variant upload failed ${storagePath}: ${error.message}`);
    stored.push({
      label: variant.label,
      format: variant.format,
      mimeType: variant.mimeType,
      width: variant.width,
      height: variant.height,
      sizeBytes: variant.sizeBytes,
      storagePath,
      publicUrl: publicUrlFor(urlBase, storagePath),
    });
  }

  const responsiveVariants = buildResponsiveVariantsMetadata(stored, {
    width: masterWidth,
    height: masterHeight,
    sizeBytes: masterBuf.byteLength,
    mimeType: "image/webp",
    storagePath: masterStoragePath,
    publicUrl: masterPublicUrl,
  });

  return {
    variants: stored,
    responsiveVariants,
    keepPaths: stored.map((v) => v.storagePath),
  };
}
