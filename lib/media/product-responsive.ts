import type { MithronAssetBucket, ResponsiveMediaAsset, ResponsiveMediaVariant } from "@/config/types";
import { buildSupabasePublicObjectUrl, MEDIA_VARIANT_WIDTHS } from "@/lib/media/media-url";

type ProductVariantEntry = {
  format?: string;
  mime_type?: string;
  storage_path?: string;
  public_url?: string;
  width?: number | null;
  height?: number | null;
  size_bytes?: number;
};

type ProductResponsiveMetadata = {
  source?: {
    width?: number | null;
    height?: number | null;
    public_url?: string | null;
    storage_path?: string | null;
  };
  generated?: Record<string, ProductVariantEntry>;
  variants?: {
    avif?: ProductVariantEntry[];
    webp?: ProductVariantEntry[];
  };
};

type ProductMediaRow = {
  id?: string | null;
  bucket?: string | null;
  storage_path?: string | null;
  public_url?: string | null;
  mime_type?: string | null;
  width?: number | string | null;
  height?: number | string | null;
  alt_text?: string | null;
  alt?: string | null;
  caption?: string | null;
  thumbnail_path?: string | null;
  webp_path?: string | null;
  variants?: unknown;
  responsive_variants?: unknown;
};

function parseFiniteDimension(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function parseResponsiveMetadata(value: unknown): ProductResponsiveMetadata | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as ProductResponsiveMetadata;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as ProductResponsiveMetadata;
  }
  return null;
}

function variantFromEntry(
  entry: ProductVariantEntry,
  format: "avif" | "webp"
): ResponsiveMediaVariant | null {
  const src = typeof entry.public_url === "string" && entry.public_url.trim()
    ? entry.public_url.trim()
    : "";
  if (!src) return null;
  const width = parseFiniteDimension(entry.width);
  const height = parseFiniteDimension(entry.height);
  if (!width || !height) return null;

  return {
    width,
    height,
    format,
    src,
    storagePath: typeof entry.storage_path === "string" ? entry.storage_path : src,
    optimizedSizeKb: typeof entry.size_bytes === "number" ? Number((entry.size_bytes / 1024).toFixed(2)) : undefined
  };
}

function variantFromLabeledEntry(
  label: string,
  entry: ProductVariantEntry,
  bucket: string,
  supabaseBaseUrl: string | undefined,
  fallbackPublicUrl: string
): ResponsiveMediaVariant | null {
  const format = entry.format === "avif" ? "avif" : "webp";
  const width = parseFiniteDimension(entry.width) || MEDIA_VARIANT_WIDTHS[label as keyof typeof MEDIA_VARIANT_WIDTHS] || 0;
  const height = parseFiniteDimension(entry.height);
  const storagePath = typeof entry.storage_path === "string" ? entry.storage_path : "";
  const src = typeof entry.public_url === "string" && entry.public_url.trim()
    ? entry.public_url.trim()
    : storagePath && supabaseBaseUrl
      ? buildSupabasePublicObjectUrl(supabaseBaseUrl, bucket, storagePath)
      : fallbackPublicUrl;

  if (!src || !width) return null;

  return {
    width,
    height: height || width,
    format,
    src,
    storagePath: storagePath || src,
    optimizedSizeKb: typeof entry.size_bytes === "number" ? Number((entry.size_bytes / 1024).toFixed(2)) : undefined
  };
}

function collectGeneratedVariants(
  metadata: ProductResponsiveMetadata,
  bucket: string,
  supabaseBaseUrl: string | undefined,
  fallbackPublicUrl: string
) {
  const avif: ResponsiveMediaVariant[] = [];
  const webp: ResponsiveMediaVariant[] = [];
  const generated = metadata.generated ?? {};

  for (const [label, entry] of Object.entries(generated)) {
    const variant = variantFromLabeledEntry(label, entry, bucket, supabaseBaseUrl, fallbackPublicUrl);
    if (!variant) continue;
    if (variant.format === "avif") avif.push(variant);
    else webp.push(variant);
  }

  for (const entry of metadata.variants?.avif ?? []) {
    const variant = variantFromEntry(entry, "avif");
    if (variant) avif.push(variant);
  }

  for (const entry of metadata.variants?.webp ?? []) {
    const variant = variantFromEntry(entry, "webp");
    if (variant) webp.push(variant);
  }

  const sortByWidth = (left: ResponsiveMediaVariant, right: ResponsiveMediaVariant) => left.width - right.width;
  return {
    avif: avif.sort(sortByWidth),
    webp: webp.sort(sortByWidth)
  };
}

export function buildProductResponsiveAsset(
  row: ProductMediaRow,
  fallbackAlt: string,
  supabaseBaseUrl?: string
): ResponsiveMediaAsset | undefined {
  const publicUrl = typeof row.public_url === "string" ? row.public_url.trim() : "";
  if (!publicUrl) return undefined;

  const metadata = parseResponsiveMetadata(row.responsive_variants ?? row.variants);
  if (!metadata) return undefined;

  const bucket = (row.bucket ?? "mithron-products") as MithronAssetBucket;
  const variants = collectGeneratedVariants(metadata, bucket, supabaseBaseUrl, publicUrl);
  if (!variants.avif.length && !variants.webp.length) return undefined;

  const width = parseFiniteDimension(row.width) || parseFiniteDimension(metadata.source?.width) || variants.webp.at(-1)?.width || variants.avif.at(-1)?.width || 0;
  const height = parseFiniteDimension(row.height) || parseFiniteDimension(metadata.source?.height) || variants.webp.at(-1)?.height || variants.avif.at(-1)?.height || 0;

  return {
    assetId: row.id ?? `product-${row.storage_path ?? publicUrl}`,
    bucket,
    assetRole: "product",
    category: "product",
    generatedPromptId: "catalog.product-media",
    status: "generated",
    fallbackSrc: publicUrl,
    fallbackAlt: row.alt_text ?? row.alt ?? row.caption ?? fallbackAlt,
    width,
    height,
    dominantColor: "#f8f8f8",
    variants: {
      ...(variants.avif.length ? { avif: variants.avif } : {}),
      ...(variants.webp.length ? { webp: variants.webp } : {})
    }
  };
}
