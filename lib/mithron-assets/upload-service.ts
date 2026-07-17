import { createHash } from "node:crypto";
// @deprecated mithron_assets — read-only legacy; canonical writes go to media_assets.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { encode } from "blurhash";
import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AssetRole = "hero" | "product" | "story" | "thumbnail" | "poster";
type Format = "avif" | "webp";

type UploadAsset = {
  assetId: string;
  bucket: string;
  assetRole: AssetRole;
  category: string;
  generatedPromptId: string;
  fallbackSrc: string;
  fallbackAlt?: string;
  localPath?: string;
  productSlug?: string;
  sourceCatalogId?: string | null;
  width?: number;
  height?: number;
};

type RetrievedManifest = {
  assets?: Array<{
    role: "product" | "hero" | "mission" | "category";
    title?: string;
    sourceKey?: string;
    output?: string;
  }>;
};

export type UploadMithronAssetsOptions = {
  dryRun?: boolean;
  limit?: number;
  mastersDir?: string;
  /** When true, do not write data/mithron-supabase-assets.generated.json */
  skipManifestWrite?: boolean;
};

export type UploadMithronAssetsResult = {
  status: "VERIFIED" | "PARTIAL";
  dryRun: boolean;
  mastersDir: string;
  generatedAssets: number;
  metadataRows: number;
  missingMasters: string[];
};

const retrievedManifestPath = join(/* turbopackIgnore: true */ process.cwd(), "data", "mithron-retrieved-assets.generated.json");
const outputManifestPath = join(/* turbopackIgnore: true */ process.cwd(), "data", "mithron-supabase-assets.generated.json");
const defaultMastersDir = join(/* turbopackIgnore: true */ process.cwd(), "public", "media", "mithron");
const cacheControl = "31536000";
const variantWidths = [3840, 2560, 1920, 1280, 768, 480];
const bucketMimeTypes = ["image/avif", "image/webp", "image/png"];
const managedBuckets = ["mithron-hero", "mithron-products", "mithron-interests", "mithron-story"];

function hashBuffer(buffer: Buffer, size = 8) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, size);
}

function slugFilename(value: string) {
  return value
    .replace(/\.master$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase();
}

function assetIdFromPath(prefix: string, src: string) {
  return `${prefix}-${src.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? "asset"}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

function getLocalAssetPath(src: string) {
  return join(/* turbopackIgnore: true */ process.cwd(), "public", src.replace(/^\//, ""));
}

function getRetrievedUploadTarget(role: "product" | "hero" | "mission" | "category") {
  if (role === "hero") return { bucket: "mithron-hero", assetRole: "hero" as const, category: "hero", prefix: "hero" };
  if (role === "product") return { bucket: "mithron-products", assetRole: "product" as const, category: "products", prefix: "product" };
  if (role === "mission") return { bucket: "mithron-story", assetRole: "story" as const, category: "story", prefix: "story" };
  return { bucket: "mithron-interests", assetRole: "poster" as const, category: "categories", prefix: "interest" };
}

function readUploadAssets(limit?: number) {
  const assets: UploadAsset[] = [];
  const fallbackSrcs = new Set<string>();

  if (existsSync(retrievedManifestPath)) {
    const retrieved = JSON.parse(readFileSync(retrievedManifestPath, "utf8")) as RetrievedManifest;
    for (const item of retrieved.assets ?? []) {
      if (!item.output || fallbackSrcs.has(item.output)) continue;
      const target = getRetrievedUploadTarget(item.role);
      assets.push({
        assetId: assetIdFromPath(target.prefix, item.output),
        bucket: target.bucket,
        assetRole: target.assetRole,
        category: target.category,
        generatedPromptId: `retrieved.${item.role}.${item.output.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? "asset"}`,
        sourceCatalogId: item.sourceKey ?? null,
        fallbackSrc: item.output,
        fallbackAlt: item.title ?? item.sourceKey ?? item.output,
        localPath: getLocalAssetPath(item.output),
        width: item.role === "product" ? 1200 : item.role === "hero" ? 1920 : 1400,
        height: item.role === "product" ? 1200 : item.role === "hero" ? 1080 : item.role === "mission" ? 1050 : 875
      });
      fallbackSrcs.add(item.output);
    }
  }

  return typeof limit === "number" && limit > 0 ? assets.slice(0, limit) : assets;
}

async function createBlurMetadata(buffer: Buffer) {
  const preview = await sharp(buffer).resize(32, 32, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(preview.data);
  const blurhash = encode(pixels, preview.info.width, preview.info.height, 4, 3);
  const blurDataUrlBuffer = await sharp(buffer).resize(28, 28, { fit: "inside" }).webp({ quality: 34 }).toBuffer();
  const blurDataUrl = `data:image/webp;base64,${blurDataUrlBuffer.toString("base64")}`;
  const stats = await sharp(buffer).stats();
  const dominant = stats.dominant;
  const dominantColor = `#${[dominant.r, dominant.g, dominant.b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  return { blurhash, blurDataUrl, dominantColor };
}

function getRoleTargets(role: AssetRole) {
  if (role === "hero") return { quality: { avif: 54, webp: 70 } };
  if (role === "thumbnail") return { quality: { avif: 44, webp: 58 } };
  if (role === "product") return { quality: { avif: 58, webp: 72 } };
  return { quality: { avif: 56, webp: 70 } };
}

async function encodeVariant(masterPath: string, width: number, format: Format, role: AssetRole) {
  const targets = getRoleTargets(role);
  const pipeline = sharp(/* turbopackIgnore: true */ masterPath).resize({ width, withoutEnlargement: true });
  if (format === "avif") {
    return pipeline.avif({ quality: targets.quality.avif, effort: 7 }).toBuffer();
  }
  return pipeline.webp({ quality: targets.quality.webp, effort: 6 }).toBuffer();
}

async function ensureBuckets(supabase: SupabaseClient) {
  for (const bucket of managedBuckets) {
    const { error } = await supabase.storage.createBucket(bucket, {
      public: true,
      allowedMimeTypes: bucketMimeTypes,
      fileSizeLimit: 5 * 1024 * 1024
    });
    if (error && !/already exists|resource already exists/i.test(error.message)) {
      throw new Error(`Failed to create bucket ${bucket}: ${error.message}`);
    }
  }
}

function createSupabaseAdminClient(dryRun: boolean) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    if (dryRun) return null;
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for upload mode.");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function uploadVariant(supabase: SupabaseClient | null, bucket: string, storagePath: string, buffer: Buffer, contentType: string, dryRun: boolean) {
  if (dryRun || !supabase) return;
  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    cacheControl,
    contentType,
    upsert: false
  });
  if (error && !/already exists|resource already exists/i.test(error.message)) {
    throw new Error(`Upload failed for ${bucket}/${storagePath}: ${error.message}`);
  }
}

function buildPublicUrl(supabaseUrl: string, bucket: string, storagePath: string) {
  return `${supabaseUrl.replace(/\/+$/g, "")}/storage/v1/object/public/${bucket}/${storagePath}`;
}

function mapUploadRowToMediaAsset(row: Record<string, unknown>, supabaseUrl: string) {
  const bucket = String(row.bucket ?? "");
  const storagePath = String(row.storage_path ?? "");
  const sizeBytes = Math.round(Number(row.optimized_size_kb ?? 0) * 1024);
  const altText = String(row.generated_prompt_id ?? row.asset_id ?? "Mithron media asset");
  return {
    id: String(row.asset_id),
    bucket,
    storage_path: storagePath,
    public_url: buildPublicUrl(supabaseUrl, bucket, storagePath),
    alt: altText,
    alt_text: altText,
    caption: null,
    folder: row.product_slug ? `products/${row.product_slug}` : String(row.category ?? "general"),
    tags: [row.format, row.asset_role, row.category].filter(Boolean),
    mime_type: row.mime_type,
    width: row.width,
    height: row.height,
    size_bytes: sizeBytes,
    file_size_bytes: sizeBytes,
    content_hash: row.content_hash ?? null,
    variants: {
      source_storage_path: storagePath,
      source_format: row.format ?? null,
      blurhash: row.blurhash ?? null,
      dominant_color: row.dominant_color ?? null
    },
    responsive_variants: {
      variant_width: row.variant_width ?? null,
      format: row.format ?? null,
      optimized_size_kb: row.optimized_size_kb ?? null
    },
    upload_metadata: {
      source_table: "upload-service",
      generated_prompt_id: row.generated_prompt_id ?? null,
      source_catalog_id: row.source_catalog_id ?? null,
      asset_role: row.asset_role ?? null,
      category: row.category ?? null
    },
    visibility: "public",
    status: "published",
    is_visible: true,
    is_primary: Boolean(row.is_primary),
    updated_at: new Date().toISOString()
  };
}

async function upsertRows(supabase: SupabaseClient | null, rows: Record<string, unknown>[], dryRun: boolean) {
  if (dryRun || !supabase || rows.length === 0) return;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const mediaRows = rows.map((row) => mapUploadRowToMediaAsset(row, supabaseUrl));
  const { error } = await supabase.from("media_assets").upsert(mediaRows, { onConflict: "id" });
  if (error) {
    throw new Error(`media_assets upsert failed: ${error.message}`);
  }
}

export async function uploadMithronAssets(options: UploadMithronAssetsOptions = {}): Promise<UploadMithronAssetsResult> {
  const dryRun = Boolean(options.dryRun);
  const mastersDir = options.mastersDir ?? defaultMastersDir;
  const assets = readUploadAssets(options.limit);
  const supabase = createSupabaseAdminClient(dryRun);
  if (supabase) {
    await ensureBuckets(supabase);
  }

  const manifestAssets = [];
  const metadataRows: Record<string, unknown>[] = [];
  const missingMasters: string[] = [];

  for (const asset of assets) {
    if (!asset.fallbackSrc) {
      throw new Error(`Upload asset ${asset.generatedPromptId} is missing fallbackSrc.`);
    }
    const masterPath = asset.localPath ?? join(/* turbopackIgnore: true */ mastersDir, asset.fallbackSrc.replace(/^\/media\/mithron\/?/, ""));
    if (!existsSync(/* turbopackIgnore: true */ masterPath)) {
      missingMasters.push(asset.localPath ?? asset.fallbackSrc);
      continue;
    }

    const source = sharp(/* turbopackIgnore: true */ masterPath);
    const sourceMeta = await source.metadata();
    const masterBuffer = await source.toBuffer();
    const blur = await createBlurMetadata(masterBuffer);
    const variants: Record<Format, Array<Record<string, unknown>>> = { avif: [], webp: [] };
    const baseName = slugFilename(parse(asset.fallbackSrc).name);
    const widths = variantWidths.filter((width) => width <= (sourceMeta.width ?? width));

    for (const width of widths) {
      for (const format of ["avif", "webp"] as const) {
        const buffer = await encodeVariant(masterPath, width, format, asset.assetRole);
        const contentHash = hashBuffer(buffer, 8);
        const storagePath = `${baseName}-${width}w-v1.${contentHash}.${format}`;
        const contentType = `image/${format}`;
        const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://PROJECT.supabase.co"}/storage/v1/object/public/${asset.bucket}/${storagePath}`;
        await uploadVariant(supabase, asset.bucket, storagePath, buffer, contentType, dryRun);

        const info = await sharp(buffer).metadata();
        const optimizedSizeKb = Number((buffer.byteLength / 1024).toFixed(2));
        variants[format].push({
          width,
          height: info.height ?? Math.round(width * ((sourceMeta.height ?? width) / (sourceMeta.width ?? width))),
          format,
          src: publicUrl,
          storagePath,
          optimizedSizeKb
        });
        metadataRows.push({
          asset_id: `${asset.generatedPromptId}.${width}.${format}.${contentHash}`,
          product_slug: asset.productSlug ?? null,
          category: asset.category,
          bucket: asset.bucket,
          storage_path: storagePath,
          asset_role: asset.assetRole,
          width: info.width ?? width,
          height: info.height ?? width,
          variant_width: width,
          format,
          mime_type: contentType,
          blurhash: blur.blurhash,
          blur_data_url: blur.blurDataUrl,
          dominant_color: blur.dominantColor,
          generated_prompt_id: asset.generatedPromptId,
          source_catalog_id: asset.sourceCatalogId ?? null,
          content_hash: contentHash,
          optimized_size_kb: optimizedSizeKb,
          is_primary: width === widths[0] && format === "avif"
        });
      }
    }

    manifestAssets.push({
      assetId: asset.assetId,
      bucket: asset.bucket,
      assetRole: asset.assetRole,
      category: asset.category,
      productSlug: asset.productSlug,
      generatedPromptId: asset.generatedPromptId,
      status: "generated",
      fallbackSrc: asset.fallbackSrc,
      fallbackAlt: asset.fallbackAlt ?? asset.assetId,
      width: sourceMeta.width ?? asset.width,
      height: sourceMeta.height ?? asset.height,
      blurhash: blur.blurhash,
      blurDataUrl: blur.blurDataUrl,
      dominantColor: blur.dominantColor,
      variants
    });
  }

  await upsertRows(supabase, metadataRows, dryRun);
  if (!dryRun && !options.skipManifestWrite) {
    mkdirSync(dirname(outputManifestPath), { recursive: true });
    writeFileSync(outputManifestPath, `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), assets: manifestAssets }, null, 2)}\n`);
  }

  return {
    status: missingMasters.length ? "PARTIAL" : "VERIFIED",
    dryRun,
    mastersDir,
    generatedAssets: manifestAssets.length,
    metadataRows: metadataRows.length,
    missingMasters
  };
}
