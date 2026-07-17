import { createHash } from "node:crypto";
// @deprecated mithron_assets — read-only legacy; canonical writes go to media_assets.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { encode } from "blurhash";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const retrievedManifestPath = join(root, "data", "mithron-retrieved-assets.generated.json");
const outputManifestPath = join(root, "data", "mithron-supabase-assets.generated.json");
const defaultMastersDir = join(root, "public", "media", "mithron");
const cacheControl = "31536000";
const variantWidths = [3840, 2560, 1920, 1280, 768, 480];
const bucketMimeTypes = ["image/avif", "image/webp", "image/png"];

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const mastersDirArg = process.argv.find((arg) => arg.startsWith("--masters-dir="));
const mastersDir = mastersDirArg ? mastersDirArg.split("=").slice(1).join("=") : defaultMastersDir;

function loadProjectEnv() {
  for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
    if (!existsSync(envPath)) continue;
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [name, ...parts] = trimmed.split("=");
      if (!name || process.env[name]) continue;
      process.env[name] = parts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function hashBuffer(buffer, size = 8) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, size);
}

function slugFilename(value) {
  return value
    .replace(/\.master$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase();
}

function assetIdFromPath(prefix, src) {
  return `${prefix}-${src.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? "asset"}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

function getRetrievedBucketAndRole(role) {
  if (role === "hero") return { bucket: "mithron-hero", assetRole: "hero", category: "hero", prefix: "hero" };
  if (role === "product") return { bucket: "mithron-products", assetRole: "product", category: "products", prefix: "product" };
  if (role === "mission") return { bucket: "mithron-story", assetRole: "story", category: "story", prefix: "story" };
  return { bucket: "mithron-interests", assetRole: "poster", category: "categories", prefix: "interest" };
}

function getLocalAssetPath(src) {
  return join(root, "public", src.replace(/^\//, ""));
}

function readUploadAssets() {
  const assets = [];
  const fallbackSrcs = new Set();

  if (!existsSync(retrievedManifestPath)) {
    return assets;
  }

  const retrieved = readJson(retrievedManifestPath);
  for (const item of retrieved.assets ?? []) {
    if (!item.output || fallbackSrcs.has(item.output)) continue;
    const role = getRetrievedBucketAndRole(item.role);
    assets.push({
      assetId: assetIdFromPath(role.prefix, item.output),
      bucket: role.bucket,
      assetRole: role.assetRole,
      category: role.category,
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

  return assets;
}

async function createBlurMetadata(buffer) {
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

function getRoleTargets(role) {
  if (role === "hero") return { quality: { avif: 54, webp: 70 }, maxKb: 700 };
  if (role === "thumbnail") return { quality: { avif: 44, webp: 58 }, maxKb: 40 };
  if (role === "product") return { quality: { avif: 58, webp: 72 }, maxKb: 220 };
  return { quality: { avif: 56, webp: 70 }, maxKb: 360 };
}

async function encodeVariant(masterPath, width, format, role) {
  const targets = getRoleTargets(role);
  const pipeline = sharp(masterPath).resize({ width, withoutEnlargement: true });
  if (format === "avif") {
    return pipeline.avif({ quality: targets.quality.avif, effort: 7 }).toBuffer();
  }
  return pipeline.webp({ quality: targets.quality.webp, effort: 6 }).toBuffer();
}

async function ensureBuckets(supabase) {
  for (const bucket of ["mithron-hero", "mithron-products", "mithron-interests", "mithron-story", "mithron-thumbnails"]) {
    const { error } = await supabase.storage.createBucket(bucket, {
      public: true,
      allowedMimeTypes: bucketMimeTypes,
      fileSizeLimit: bucket === "mithron-thumbnails" ? "512KB" : "5MB"
    });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Failed to create bucket ${bucket}: ${error.message}`);
    }
  }
}

function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    if (dryRun) return null;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (url && publishableKey && !serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for upload mode. The current project only exposes a publishable key, and the existing storage policies allow writes only to service_role.");
    }
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for upload mode.");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function uploadVariant(supabase, bucket, storagePath, buffer, contentType) {
  if (dryRun || !supabase) return;
  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    cacheControl,
    contentType,
    upsert: false
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Upload failed for ${bucket}/${storagePath}: ${error.message}`);
  }
}

function buildPublicUrl(supabaseUrl, bucket, storagePath) {
  return `${supabaseUrl.replace(/\/+$/g, "")}/storage/v1/object/public/${bucket}/${storagePath}`;
}

function mapUploadRowToMediaAsset(row, supabaseUrl) {
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
      source_table: "optimize-upload-mithron-assets",
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

async function upsertRows(supabase, rows) {
  if (dryRun || !supabase || rows.length === 0) return;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const mediaRows = rows.map((row) => mapUploadRowToMediaAsset(row, supabaseUrl));
  const { error } = await supabase.from("media_assets").upsert(mediaRows, { onConflict: "id" });
  if (error) {
    throw new Error(`media_assets upsert failed: ${error.message}`);
  }
}

async function main() {
  loadProjectEnv();
  const assets = readUploadAssets();
  const supabase = createSupabaseAdminClient();
  if (supabase) {
    await ensureBuckets(supabase);
  }

  const manifestAssets = [];
  const metadataRows = [];
  const missingMasters = [];

  for (const asset of assets) {
    if (!asset.fallbackSrc) {
      throw new Error(`Retrieved Mithron asset ${asset.generatedPromptId} is missing fallbackSrc.`);
    }
    const masterPath = asset.localPath ?? join(mastersDir, asset.fallbackSrc.replace(/^\/media\/mithron\/?/, ""));
    if (!existsSync(masterPath)) {
      missingMasters.push(asset.localPath ?? asset.fallbackSrc);
      continue;
    }

    const source = sharp(masterPath);
    const sourceMeta = await source.metadata();
    const masterBuffer = await source.toBuffer();
    const blur = await createBlurMetadata(masterBuffer);
    const variants = { avif: [], webp: [] };
    const baseName = slugFilename(parse(asset.fallbackSrc).name);
    const widths = variantWidths.filter((width) => width <= (sourceMeta.width ?? width));

    for (const width of widths) {
      for (const format of ["avif", "webp"]) {
        const buffer = await encodeVariant(masterPath, width, format, asset.assetRole);
        const hash = hashBuffer(buffer, 8);
        const storagePath = `${baseName}-${width}w-v1.${hash}.${format}`;
        const contentType = `image/${format}`;
        const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://PROJECT.supabase.co"}/storage/v1/object/public/${asset.bucket}/${storagePath}`;
        await uploadVariant(supabase, asset.bucket, storagePath, buffer, contentType);

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
          asset_id: `${asset.generatedPromptId}.${width}.${format}.${hash}`,
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
          content_hash: hash,
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

  await upsertRows(supabase, metadataRows);
  if (!dryRun) {
    mkdirSync(dirname(outputManifestPath), { recursive: true });
    writeFileSync(outputManifestPath, `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), assets: manifestAssets }, null, 2)}\n`);
  }

  console.log(JSON.stringify({
    status: missingMasters.length ? "PARTIAL" : "VERIFIED",
    dryRun,
    mastersDir,
    generatedAssets: manifestAssets.length,
    metadataRows: metadataRows.length,
    missingMasters
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
