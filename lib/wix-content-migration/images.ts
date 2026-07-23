import { createHash } from "node:crypto";
import type { MigratedImage } from "./types.ts";
import { createRateLimiter } from "./rate-limit.ts";

export type ValidatedSourceImage = {
  url: string;
  alt: string;
  order: number;
  contentType: string;
  contentHash: string;
  buffer: Buffer;
  width?: number | null;
  height?: number | null;
};

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

/** Prefer original Wix media files over resized /v1/fit|/v1/fill derivatives. */
export function maximizeWixMediaUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  const fitOrFill = /^(https?:\/\/static\.wixstatic\.com\/media\/[^?\s]+?)\/v1\/(?:fit|fill)\/[^/]+\/file\.[a-z0-9]+(\?.*)?$/i;
  const withoutDerivative = trimmed.replace(fitOrFill, "$1$2");
  try {
    const parsed = new URL(withoutDerivative);
    // Drop common resize/quality query knobs while keeping cache-busting tokens if present.
    for (const key of ["w", "h", "fit", "fill", "blur", "q", "quality"]) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return withoutDerivative;
  }
}

export function dedupeImagesByUrl(images: MigratedImage[]): MigratedImage[] {
  const seen = new Set<string>();
  const result: MigratedImage[] = [];
  for (const image of images) {
    const maximized = maximizeWixMediaUrl(image.url) || image.url;
    const key = normalizeUrl(maximized).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...image, url: maximized, sourceUrl: image.sourceUrl || maximized, order: result.length });
  }
  return result;
}

export function isValidHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function validateAndDownloadImages(
  images: MigratedImage[],
  options: { minIntervalMs?: number } = {}
): Promise<{ valid: ValidatedSourceImage[]; invalid: Array<{ url: string; reason: string }> }> {
  const limiter = createRateLimiter({ minIntervalMs: options.minIntervalMs ?? 250 });
  const deduped = dedupeImagesByUrl(images);
  const valid: ValidatedSourceImage[] = [];
  const invalid: Array<{ url: string; reason: string }> = [];
  const hashSeen = new Set<string>();

  for (const image of deduped) {
    if (!isValidHttpUrl(image.url)) {
      invalid.push({ url: image.url, reason: "invalid_url" });
      continue;
    }

    try {
      const downloaded = await limiter.withRetry(async () => {
        const response = await fetch(image.url, { redirect: "follow" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
        if (contentType && !contentType.startsWith("image/")) {
          throw new Error(`not_image:${contentType || "unknown"}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!buffer.byteLength) throw new Error("empty_image");
        if (buffer.byteLength > 12 * 1024 * 1024) throw new Error("image_too_large");
        return {
          buffer,
          contentType: contentType.startsWith("image/") ? contentType : "image/jpeg"
        };
      }, `download ${image.url}`);

      const contentHash = createHash("sha256").update(downloaded.buffer).digest("hex");
      if (hashSeen.has(contentHash)) continue;
      hashSeen.add(contentHash);

      valid.push({
        url: image.url,
        alt: image.alt || "Product image",
        order: valid.length,
        contentType: downloaded.contentType,
        contentHash,
        buffer: downloaded.buffer
      });
    } catch (error) {
      invalid.push({
        url: image.url,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { valid, invalid };
}

export function extensionFromMimeType(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("avif")) return "avif";
  return "jpg";
}
