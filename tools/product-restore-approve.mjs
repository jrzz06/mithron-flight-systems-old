#!/usr/bin/env node
/**
 * Approve and replace one restored product cutout in Supabase.
 * Deletes old cutout storage + media_assets rows for that product.
 *
 * Usage:
 *   node tools/product-restore-approve.mjs --slug source-10-liter-dual-agri-drone
 *   node tools/product-restore-approve.mjs --slug source-10-liter-dual-agri-drone --dry-run
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const BATCH_ROOT = join(projectRoot, "tools", ".product-restore-batch");
const BUCKET = "mithron-products";
const CUTOUT_VARIANT_ID = "catalog-cutout-v1";

function parseArgs() {
  const args = process.argv.slice(2);
  const slugIdx = args.indexOf("--slug");
  const slug = slugIdx >= 0 ? args[slugIdx + 1] : "";
  return {
    slug: slug?.trim() || "",
    dryRun: args.includes("--dry-run")
  };
}

function loadProjectEnv() {
  for (const envPath of [join(projectRoot, ".env.local"), join(projectRoot, ".env")]) {
    if (!existsSync(envPath)) continue;
    const raw = readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [name, ...parts] = trimmed.split("=");
      if (!name || process.env[name]) continue;
      process.env[name] = parts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

function hashBuffer(buffer, size = 12) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, size);
}

function encodeObjectPath(path) {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function publicUrl(supabaseUrl, storagePath) {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${encodeObjectPath(storagePath)}`;
}

async function encodeWebpUnderCap(pngBuffer, capBytes) {
  for (const q of [95, 92, 90, 88, 86, 84, 82, 80, 78, 75, 72, 68, 60]) {
    const webp = await sharp(pngBuffer).webp({ quality: q, effort: 6, alphaQuality: 100, smartSubsample: true }).toBuffer();
    if (webp.byteLength <= capBytes) {
      return { buffer: webp, quality: q };
    }
  }
  const fallback = await sharp(pngBuffer).webp({ quality: 60, effort: 6, alphaQuality: 100 }).toBuffer();
  return { buffer: fallback, quality: 60 };
}

async function main() {
  const { slug, dryRun } = parseArgs();
  if (!slug) {
    throw new Error("Missing --slug");
  }

  loadProjectEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }

  const productDir = join(BATCH_ROOT, slug);
  const restoredPng = join(productDir, "before.restored.png");
  const beforeWebp = join(productDir, "before.webp");
  if (!existsSync(restoredPng)) {
    throw new Error(`Restored PNG not found: ${restoredPng}`);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: product, error: productError } = await supabase
    .from("mithron_products")
    .select("slug,name,image")
    .eq("slug", slug)
    .maybeSingle();
  if (productError) throw new Error(productError.message);
  if (!product) throw new Error(`Product not found: ${slug}`);

  const productName = product.name || slug;
  const oldUrl = product.image?.src || "";
  const capBytes = existsSync(beforeWebp) ? readFileSync(beforeWebp).byteLength : Number.MAX_SAFE_INTEGER;

  const pngBuffer = readFileSync(restoredPng);
  const meta = await sharp(pngBuffer, { failOn: "none" }).metadata();
  if (!meta.hasAlpha) throw new Error("Restored PNG missing alpha");

  const { buffer: webpBuffer, quality } = await encodeWebpUnderCap(pngBuffer, capBytes);
  const normalizedSlug = slug.replace(/^source-/, "");
  const contentHash = hashBuffer(webpBuffer);
  const storagePath = `catalog-cutouts/v1/${normalizedSlug}-${contentHash}.webp`;
  const mediaAssetId = `catalog.cutout.v1.${slug}.${contentHash}`;
  const now = new Date().toISOString();
  const url = publicUrl(supabaseUrl, storagePath);

  const { data: oldAssets } = await supabase
    .from("media_assets")
    .select("id,storage_path")
    .or(`tags.cs.{${slug}},storage_path.like.%${slug}%`)
    .like("storage_path", "%catalog-cutouts%");

  const oldPaths = [...new Set((oldAssets || []).map((row) => row.storage_path).filter(Boolean))];
  const oldIds = [...new Set((oldAssets || []).map((row) => row.id).filter(Boolean))];

  const plan = {
    status: dryRun ? "dry_run" : "approved",
    productSlug: slug,
    productName,
    restoredPng,
    newStoragePath: storagePath,
    newPublicUrl: url,
    newBytes: webpBuffer.byteLength,
    capBytes,
    webpQuality: quality,
    width: meta.width,
    height: meta.height,
    oldUrl,
    oldStoragePathsToDelete: oldPaths.filter((p) => p !== storagePath),
    oldMediaAssetIdsToDelete: oldIds.filter((id) => id !== mediaAssetId)
  };

  if (dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, webpBuffer, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false
  });
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const mediaRow = {
    id: mediaAssetId,
    bucket: BUCKET,
    folder: "catalog-cutouts/v1",
    storage_path: storagePath,
    public_url: url,
    mime_type: "image/webp",
    file_size_bytes: webpBuffer.byteLength,
    size_bytes: webpBuffer.byteLength,
    width: meta.width ?? 1024,
    height: meta.height ?? 1024,
    content_hash: contentHash,
    alt: productName,
    alt_text: productName,
    caption: productName,
    tags: ["catalog-cutout", slug, "local-restore-v1"],
    visibility: "public",
    status: "published",
    is_visible: true,
    is_primary: false,
    upload_metadata: {
      source: "product-restore-approve",
      product_slug: slug,
      variant_id: CUTOUT_VARIANT_ID,
      restored_from: restoredPng,
      uploaded_at: now
    },
    updated_at: now
  };

  const { error: mediaError } = await supabase.from("media_assets").upsert(mediaRow, { onConflict: "id" });
  if (mediaError) throw new Error(`media_assets upsert failed: ${mediaError.message}`);

  await supabase
    .from("product_media_assets")
    .delete()
    .eq("product_slug", slug)
    .eq("usage", "cms")
    .eq("variant_id", CUTOUT_VARIANT_ID);

  const { error: linkError } = await supabase.from("product_media_assets").insert({
    product_slug: slug,
    media_asset_id: mediaAssetId,
    usage: "cms",
    variant_id: CUTOUT_VARIANT_ID,
    sort_order: -500,
    is_primary: false,
    alt_text: productName,
    caption: productName,
    metadata: {
      source: "product-restore-approve",
      public_url: url,
      variant_id: CUTOUT_VARIANT_ID
    },
    updated_at: now
  });
  if (linkError) throw new Error(`product_media_assets insert failed: ${linkError.message}`);

  const mediaJson = {
    src: url,
    alt: productName,
    kind: "image",
    width: meta.width ?? 1024,
    height: meta.height ?? 1024
  };

  const { error: productUpdateError } = await supabase
    .from("mithron_products")
    .update({
      image: mediaJson,
      hero: mediaJson,
      gallery: [mediaJson],
      updated_at: now
    })
    .eq("slug", slug);
  if (productUpdateError) throw new Error(`mithron_products update failed: ${productUpdateError.message}`);

  await supabase.from("product_media_assets").delete().eq("product_slug", slug).eq("usage", "primary");

  const { error: primaryError } = await supabase.from("product_media_assets").insert({
    product_slug: slug,
    media_asset_id: mediaAssetId,
    usage: "primary",
    variant_id: null,
    sort_order: 0,
    is_primary: true,
    alt_text: productName,
    caption: productName,
    metadata: {
      source: "product-restore-approve",
      public_url: url
    },
    updated_at: now
  });
  if (primaryError) throw new Error(`primary link insert failed: ${primaryError.message}`);

  for (const oldPath of plan.oldStoragePathsToDelete) {
    await supabase.storage.from(BUCKET).remove([oldPath]);
  }
  for (const oldId of plan.oldMediaAssetIdsToDelete) {
    await supabase.from("media_assets").delete().eq("id", oldId);
  }

  console.log(
    JSON.stringify(
      {
        ...plan,
        status: "replaced",
        deletedStoragePaths: plan.oldStoragePathsToDelete,
        deletedMediaAssetIds: plan.oldMediaAssetIdsToDelete
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
