type JsonRecord = Record<string, unknown>;

export const CANONICAL_MEDIA_BUCKETS = [
  "mithron-products"
] as const;

export type CanonicalMediaBucket = (typeof CANONICAL_MEDIA_BUCKETS)[number];

type MediaVisibility = "public" | "private" | "internal" | "draft" | "archived";

type BuildRecordOptions = {
  actorId: string | null;
  at?: string;
};

type BuildObjectPathInput = {
  bucket: string;
  folder?: string | null;
  fileName: string;
  at?: string;
};

const imageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif"
]);

const videoMimeTypes = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);

export const ALLOWED_MEDIA_MIME_TYPES = new Set([...imageMimeTypes, ...videoMimeTypes]);

const allowedBuckets = new Set<string>(CANONICAL_MEDIA_BUCKETS);

function readRequiredString(formData: FormData, key: string, label: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} ${key} is required.`);
  }
  return value.trim();
}

function readOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalPositiveNumber(formData: FormData, key: string, label: string) {
  const value = readOptionalString(formData, key);
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return parsed;
}

function readOptionalJsonObject(formData: FormData, key: string, label: string): JsonRecord {
  const value = readOptionalString(formData, key);
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} ${key} must be a JSON object.`);
    }
    return parsed as JsonRecord;
  } catch (error) {
    if (error instanceof Error && /must be a JSON object/.test(error.message)) throw error;
    throw new Error(`${label} ${key} must be valid JSON.`);
  }
}

function normalizeIsoForPath(value: string) {
  return value.replace(/[-:.]/g, "");
}

function slugifySegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function normalizeFileName(fileName: string) {
  const trimmed = fileName.trim();
  const extensionMatch = trimmed.match(/\.([a-zA-Z0-9]+)$/);
  const extension = extensionMatch?.[1]?.toLowerCase() ?? "bin";
  const baseName = extensionMatch ? trimmed.slice(0, -extensionMatch[0].length) : trimmed;
  const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error("Media file name must include at least one alphanumeric character.");
  }
  return `${slug}.${extension}`;
}

export function parseMediaTags(value: string | null | undefined) {
  const seen = new Set<string>();
  const tags = String(value ?? "")
    .split(/[\n,]+/g)
    .map((tag) => tag.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean);

  return tags.filter((tag) => {
    if (seen.has(tag)) return false;
    seen.add(tag);
    return true;
  });
}

export function assertAllowedMediaBucket(bucket: string): CanonicalMediaBucket {
  if (!allowedBuckets.has(bucket)) {
    throw new Error(`Media bucket ${bucket} is not a canonical Mithron media bucket.`);
  }
  return bucket as CanonicalMediaBucket;
}

export function assertAllowedMediaMimeType(mimeType: string, bucket: string) {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  const allowed = ALLOWED_MEDIA_MIME_TYPES;
  if (!allowed.has(normalizedMimeType)) {
    throw new Error(`Media MIME type ${mimeType} is not allowed for ${bucket}.`);
  }
  return normalizedMimeType;
}

function bytesStartWith(bytes: Uint8Array, signature: number[]) {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function readAscii(bytes: Uint8Array, start: number, length: number) {
  if (bytes.length < start + length) return "";
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/**
 * Best-effort content sniff for allowlisted media types.
 * Returns null when the signature is inconclusive (caller must keep declared MIME).
 */
export function sniffMediaMimeFromBytes(bytes: Uint8Array): string | null {
  if (!bytes.length) return null;

  if (bytesStartWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (bytesStartWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || bytesStartWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) {
    return "image/gif";
  }
  if (bytesStartWith(bytes, [0x52, 0x49, 0x46, 0x46]) && readAscii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  if (bytesStartWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";

  // ISO BMFF (ftyp): AVIF / MP4 / QuickTime
  if (bytes.length >= 12 && readAscii(bytes, 4, 4) === "ftyp") {
    const brand = readAscii(bytes, 8, 4).toLowerCase();
    const compatible = readAscii(bytes, 16, Math.min(24, Math.max(0, bytes.length - 16))).toLowerCase();
    const brands = `${brand}${compatible}`;
    if (brands.includes("avif") || brands.includes("avis")) return "image/avif";
    if (brands.includes("qt  ") || brand === "qt  ") return "video/quicktime";
    if (
      brands.includes("isom")
      || brands.includes("iso2")
      || brands.includes("mp41")
      || brands.includes("mp42")
      || brands.includes("avc1")
      || brands.includes("m4v ")
    ) {
      return "video/mp4";
    }
  }

  return null;
}

/**
 * Reject only clear MIME spoofing. Inconclusive sniff keeps the declared allowlisted MIME.
 */
export function assertMediaMimeMatchesContent(input: {
  declaredMime: string;
  bytes: Uint8Array;
}): string {
  const declared = input.declaredMime.trim().toLowerCase();
  if (!ALLOWED_MEDIA_MIME_TYPES.has(declared)) {
    throw new Error(`Media MIME type ${input.declaredMime} is not allowed.`);
  }

  const sniffed = sniffMediaMimeFromBytes(input.bytes);
  if (!sniffed) {
    return declared;
  }
  if (sniffed === declared) {
    return declared;
  }
  throw new Error(
    `Uploaded file content looks like ${sniffed}, but the declared type was ${declared}.`
  );
}

type EnvSource = Record<string, string | undefined>;

type UploadSizeInput = {
  size: number;
  name?: string;
};

export function resolveMaxUploadBytes(env: EnvSource = process.env) {
  return Number(env.MEDIA_MAX_UPLOAD_BYTES?.trim() || 0) || 50 * 1024 * 1024;
}

export function assertMediaUploadSize(file: UploadSizeInput, env: EnvSource = process.env) {
  const maxUploadBytes = resolveMaxUploadBytes(env);
  if (file.size > maxUploadBytes) {
    const label = file.name ? `File "${file.name}"` : "File";
    throw new Error(`${label} exceeds the maximum upload size of ${Math.round(maxUploadBytes / 1024 / 1024)} MB.`);
  }
}

export function buildStorageObjectPath(input: BuildObjectPathInput) {
  assertAllowedMediaBucket(input.bucket);
  const folder = slugifySegment(input.folder ?? "uploads") || "uploads";
  const timestamp = normalizeIsoForPath(input.at ?? new Date().toISOString());
  const fileName = normalizeFileName(input.fileName);
  return `${folder}/${timestamp}-${fileName}`;
}

export function buildMediaAssetId(bucket: string, storagePath: string) {
  assertAllowedMediaBucket(bucket);
  const pathSlug = storagePath
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `media-${bucket.replace(/^mithron-/, "")}-${pathSlug}`;
}

function readMediaVisibility(formData: FormData): MediaVisibility {
  const value = readOptionalString(formData, "visibility") ?? "public";
  if (!["public", "private", "internal", "draft", "archived"].includes(value)) {
    throw new Error("Media visibility must be one of: public, private, internal, draft, archived.");
  }
  return value as MediaVisibility;
}

function buildVariants(formData: FormData, width: number | null, height: number | null) {
  const avifPath = readOptionalString(formData, "avif_path") ?? null;
  const webpPath = readOptionalString(formData, "webp_path") ?? null;
  const thumbnailPath = readOptionalString(formData, "thumbnail_path") ?? null;
  const responsiveVariants = readOptionalJsonObject(formData, "responsive_variants", "Media");

  return {
    variants: {
      ...(avifPath ? { avif: { storage_path: avifPath, ready: true } } : {}),
      ...(webpPath ? { webp: { storage_path: webpPath, ready: true } } : {}),
      ...(thumbnailPath ? { thumbnail: { storage_path: thumbnailPath, ready: true } } : {}),
      ...(Object.keys(responsiveVariants).length ? { responsive: responsiveVariants } : {})
    },
    responsiveVariants: Object.keys(responsiveVariants).length
      ? responsiveVariants
      : {
          source: { width, height },
          avif_ready: Boolean(avifPath),
          webp_ready: Boolean(webpPath),
          thumbnail_ready: Boolean(thumbnailPath)
        }
  };
}

export function buildMediaAssetRecordFromFormData(formData: FormData, options: BuildRecordOptions) {
  const bucket = assertAllowedMediaBucket(readRequiredString(formData, "bucket", "Media"));
  const storagePath = readRequiredString(formData, "storage_path", "Media");
  const mimeType = assertAllowedMediaMimeType(readRequiredString(formData, "mime_type", "Media"), bucket);
  const visibility = readMediaVisibility(formData);
  const width = readOptionalPositiveNumber(formData, "width", "Media width");
  const height = readOptionalPositiveNumber(formData, "height", "Media height");
  const fileSizeBytes = readOptionalPositiveNumber(formData, "file_size_bytes", "Media file size")
    ?? readOptionalPositiveNumber(formData, "size_bytes", "Media file size")
    ?? 0;
  const altText = readOptionalString(formData, "alt_text") ?? readOptionalString(formData, "alt") ?? null;
  const caption = readOptionalString(formData, "caption") ?? null;
  const id = readOptionalString(formData, "id") ?? buildMediaAssetId(bucket, storagePath);
  const publicUrl = readOptionalString(formData, "public_url") ?? "";
  const folder = slugifySegment(readOptionalString(formData, "folder") ?? "uploads") || "uploads";
  const uploadMetadata = readOptionalJsonObject(formData, "upload_metadata", "Media");
  const usageScope = readOptionalString(formData, "usage_scope") ?? "editorial";
  const { variants, responsiveVariants } = buildVariants(formData, width, height);
  const now = options.at ?? new Date().toISOString();

  return {
    id,
    bucket,
    storage_path: storagePath,
    public_url: publicUrl,
    alt: altText,
    alt_text: altText,
    caption,
    folder,
    tags: parseMediaTags(readOptionalString(formData, "tags")),
    mime_type: mimeType,
    width,
    height,
    size_bytes: fileSizeBytes,
    file_size_bytes: fileSizeBytes,
    content_hash: readOptionalString(formData, "content_hash") ?? null,
    variants,
    responsive_variants: responsiveVariants,
    upload_metadata: {
      ...uploadMetadata,
      usage_scope: usageScope,
      optimization: {
        avif_ready: Boolean(readOptionalString(formData, "avif_path")),
        webp_ready: Boolean(readOptionalString(formData, "webp_path")),
        thumbnail_ready: Boolean(readOptionalString(formData, "thumbnail_path"))
      }
    },
    version: Number(readOptionalPositiveNumber(formData, "version", "Media version") ?? 1),
    is_primary: readOptionalString(formData, "is_primary") === "on" || readOptionalString(formData, "is_primary") === "true",
    is_visible: visibility === "public",
    visibility,
    status: visibility === "public" ? "published" : "draft",
    created_by: options.actorId,
    uploaded_by: options.actorId,
    updated_at: now
  };
}
