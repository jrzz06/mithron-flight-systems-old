export type ProductImageJson = {
  src?: string | null;
  alt?: string | null;
  width?: number | string | null;
  height?: number | string | null;
  kind?: string | null;
};

export type ProductPrimaryMediaCandidate = {
  slug: string;
  name: string;
  image: ProductImageJson | null;
};

export type PrimaryMediaBackfillRow = {
  id: string;
  bucket: string;
  storage_path: string;
  public_url: string;
  alt: string;
  alt_text: string;
  caption: string;
  folder: string;
  tags: string[];
  mime_type: string;
  width: number | null;
  height: number | null;
  visibility: "public";
  status: "published";
  is_visible: boolean;
  is_primary: boolean;
  upload_metadata: Record<string, unknown>;
  updated_at: string;
};

export type ProductPrimaryMediaLinkRow = {
  product_slug: string;
  media_asset_id: string;
  usage: "primary";
  sort_order: number;
  is_primary: boolean;
  alt_text: string;
  caption: string;
  metadata: Record<string, unknown>;
  updated_at: string;
};

const BACKFILL_VERSION = 1;

function positiveInt(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

export function buildPrimaryMediaAssetId(slug: string) {
  return `product-primary.${slug}`;
}

export function parseStoragePublicUrl(url: string) {
  const trimmed = url.trim();
  const match = trimmed.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return {
    bucket: match[1],
    storagePath: decodeURIComponent(match[2])
  };
}

export function mimeTypeFromStoragePath(storagePath: string) {
  const lowered = storagePath.toLowerCase();
  if (lowered.endsWith(".avif")) return "image/avif";
  if (lowered.endsWith(".webp")) return "image/webp";
  if (lowered.endsWith(".png")) return "image/png";
  if (lowered.endsWith(".jpg") || lowered.endsWith(".jpeg")) return "image/jpeg";
  if (lowered.endsWith(".gif")) return "image/gif";
  if (lowered.endsWith(".svg")) return "image/svg+xml";
  return "image/jpeg";
}

export function buildPrimaryMediaBackfill({
  products,
  linkedSlugs,
  supabaseUrl,
  at = new Date().toISOString()
}: {
  products: ProductPrimaryMediaCandidate[];
  linkedSlugs: Set<string>;
  supabaseUrl: string;
  at?: string;
}) {
  const mediaAssets: PrimaryMediaBackfillRow[] = [];
  const productMediaAssets: ProductPrimaryMediaLinkRow[] = [];
  const skipped: Array<{ slug: string; reason: string; detail?: string }> = [];

  for (const product of products) {
    if (linkedSlugs.has(product.slug)) continue;

    const src = typeof product.image?.src === "string" ? product.image.src.trim() : "";
    if (!src) {
      skipped.push({ slug: product.slug, reason: "missing_image_src" });
      continue;
    }

    const parsed = parseStoragePublicUrl(src);
    if (!parsed) {
      skipped.push({ slug: product.slug, reason: "non_supabase_storage_url", detail: src });
      continue;
    }

    const alt = (typeof product.image?.alt === "string" && product.image.alt.trim())
      ? product.image.alt.trim()
      : product.name.trim() || product.slug;
    const mediaId = buildPrimaryMediaAssetId(product.slug);
    const publicUrl = src.startsWith("http")
      ? src
      : `${supabaseUrl.replace(/\/+$/g, "")}/storage/v1/object/public/${parsed.bucket}/${parsed.storagePath}`;

    mediaAssets.push({
      id: mediaId,
      bucket: parsed.bucket,
      storage_path: parsed.storagePath,
      public_url: publicUrl,
      alt,
      alt_text: alt,
      caption: product.name,
      folder: `products/${product.slug}`,
      tags: ["primary-backfill", "product-primary", product.slug],
      mime_type: mimeTypeFromStoragePath(parsed.storagePath),
      width: positiveInt(product.image?.width),
      height: positiveInt(product.image?.height),
      visibility: "public",
      status: "published",
      is_visible: true,
      is_primary: true,
      upload_metadata: {
        source: "mithron_products.image",
        backfill_version: BACKFILL_VERSION,
        fallback_preserved: true
      },
      updated_at: at
    });

    productMediaAssets.push({
      product_slug: product.slug,
      media_asset_id: mediaId,
      usage: "primary",
      sort_order: 0,
      is_primary: true,
      alt_text: alt,
      caption: product.name,
      metadata: {
        source: "mithron_products.image",
        backfill_version: BACKFILL_VERSION,
        fallback_preserved: true
      },
      updated_at: at
    });
  }

  return {
    mediaAssets,
    productMediaAssets,
    skipped,
    summary: {
      candidates: products.length,
      linkedSkipped: products.filter((product) => linkedSlugs.has(product.slug)).length,
      mediaAssets: mediaAssets.length,
      productMediaLinks: productMediaAssets.length,
      skipped: skipped.length,
      fallbackPreserved: true
    }
  };
}
