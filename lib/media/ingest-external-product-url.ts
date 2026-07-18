import { readMediaSrc } from "@/lib/media/read-media-src";
import {
  isAllowedProductMediaUrl,
  isBlockedExternalMediaUrl,
  isSupabaseProductStorageUrl
} from "@/lib/media/is-blocked-external-media-url";
import { MAX_PRODUCT_IMAGE_BYTES } from "@/lib/product-image-limits";
import { uploadSingleProductImageBuffer } from "@/services/product-image-upload";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type JsonRecord = Record<string, unknown>;

export type ProductMediaRow = {
  slug: string;
  name: string;
  image?: unknown;
  hero?: unknown;
  gallery?: unknown;
  source_images?: unknown;
};

export type IngestedProductMediaResult = {
  sourceUrl: string;
  publicUrl: string;
  mediaAssetId: string;
  bucket: string;
  storagePath: string;
  width: number | null;
  height: number | null;
};

function extensionFromMimeType(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("avif")) return "avif";
  return "jpg";
}

function fileNameFromUrl(url: string, mimeType: string) {
  try {
    const pathname = new URL(url).pathname;
    const segment = pathname.split("/").filter(Boolean).pop() ?? "imported-image";
    if (/\.[a-z0-9]{2,5}$/i.test(segment)) return segment;
    return `${segment}.${extensionFromMimeType(mimeType)}`;
  } catch {
    return `imported-image.${extensionFromMimeType(mimeType)}`;
  }
}

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

export function collectExternalProductMediaUrls(row: ProductMediaRow) {
  const urls: string[] = [];
  const seen = new Set<string>();

  const push = (value: unknown) => {
    const src = readMediaSrc(value);
    if (!src || seen.has(src)) return;
    if (isAllowedProductMediaUrl(src)) return;
    if (!isBlockedExternalMediaUrl(src)) return;
    seen.add(src);
    urls.push(src);
  };

  push(row.image);
  push(row.hero);

  if (Array.isArray(row.gallery)) {
    for (const item of row.gallery) push(item);
  }

  if (Array.isArray(row.source_images)) {
    for (const item of row.source_images) {
      if (typeof item === "string") {
        const src = item.trim();
        if (src && !seen.has(src) && isBlockedExternalMediaUrl(src)) {
          seen.add(src);
          urls.push(src);
        }
        continue;
      }
      push(item);
    }
  }

  return urls;
}

export function collectSupabaseProductMediaUrls(row: ProductMediaRow) {
  const urls: string[] = [];
  const seen = new Set<string>();

  const push = (value: unknown) => {
    const src = readMediaSrc(value);
    if (!src || seen.has(src) || !isSupabaseProductStorageUrl(src)) return;
    seen.add(normalizeUrl(src));
    urls.push(normalizeUrl(src));
  };

  push(row.image);
  push(row.hero);

  if (Array.isArray(row.gallery)) {
    for (const item of row.gallery) push(item);
  }

  return [...new Set(urls.map(normalizeUrl))];
}

export async function downloadExternalProductImage(url: string) {
  const response = await fetchWithTimeout(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to download image (${response.status} ${response.statusText})`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (contentType && !contentType.startsWith("image/")) {
    throw new Error(`Downloaded content is not an image (${contentType})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.byteLength) {
    throw new Error("Downloaded image is empty.");
  }
  if (buffer.byteLength > MAX_PRODUCT_IMAGE_BYTES) {
    throw new Error("Downloaded image exceeds the 12 MB product upload limit.");
  }

  const mimeType = contentType.startsWith("image/") ? contentType : "image/jpeg";
  return {
    buffer,
    mimeType,
    sizeBytes: buffer.byteLength,
    fileName: fileNameFromUrl(url, mimeType)
  };
}

export function buildProductMediaJson(input: {
  src: string;
  alt: string;
  width?: number | null;
  height?: number | null;
}) {
  return {
    src: input.src,
    alt: input.alt,
    kind: "image" as const,
    ...(input.width ? { width: input.width } : {}),
    ...(input.height ? { height: input.height } : {}),
    local: false
  };
}

export async function ingestExternalProductUrl(input: {
  sourceUrl: string;
  productSlug: string;
  productName: string;
  actorId: string | null;
  fileIndex?: number;
}): Promise<IngestedProductMediaResult> {
  const downloaded = await downloadExternalProductImage(input.sourceUrl);
  const uploaded = await uploadSingleProductImageBuffer({
    buffer: downloaded.buffer,
    fileName: downloaded.fileName,
    mimeType: downloaded.mimeType,
    sizeBytes: downloaded.sizeBytes,
    productName: input.productName,
    productSlug: input.productSlug,
    actorId: input.actorId,
    source: "external-media-ingest",
    fileIndex: input.fileIndex ?? 0,
    externalSourceUrl: input.sourceUrl
  });

  return {
    sourceUrl: input.sourceUrl,
    publicUrl: uploaded.publicUrl,
    mediaAssetId: uploaded.mediaAssetId,
    bucket: uploaded.bucket,
    storagePath: uploaded.storagePath,
    width: uploaded.width,
    height: uploaded.height
  };
}

export function buildMigratedProductMediaFields(input: {
  productName: string;
  ingested: IngestedProductMediaResult[];
  existingSupabaseUrls?: string[];
}) {
  const primary = input.ingested[0] ?? null;
  const galleryUrls = [
    ...(primary ? [primary.publicUrl] : []),
    ...input.ingested.slice(1).map((item) => item.publicUrl),
    ...(input.existingSupabaseUrls ?? []).filter((url) => !input.ingested.some((item) => item.publicUrl === url))
  ];

  const uniqueGalleryUrls = [...new Set(galleryUrls.map(normalizeUrl))];
  const alt = input.productName.trim() || "Product image";

  const image = primary
    ? buildProductMediaJson({
      src: primary.publicUrl,
      alt,
      width: primary.width,
      height: primary.height
    })
    : undefined;

  const gallery = uniqueGalleryUrls.map((src) => {
    const match = input.ingested.find((item) => normalizeUrl(item.publicUrl) === normalizeUrl(src));
    return buildProductMediaJson({
      src,
      alt,
      width: match?.width ?? null,
      height: match?.height ?? null
    });
  });

  const source_images = uniqueGalleryUrls.map((src) => ({ src }));

  return {
    image,
    hero: image,
    gallery,
    source_images
  };
}
