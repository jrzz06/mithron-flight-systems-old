/**
 * One-shot: replace a single product's catalog cutout with a pre-made showcase WebP.
 * Usage: node tools/replace-one-showcase-cutout.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const PRODUCT_SLUG = "source-2408-sets-of-propeller-with-adaptor";
const PRODUCT_NAME = "2408 SETS OF PROPELLER WITH ADAPTOR";
const SOURCE_WEBP = join(
  "C:/Users/Administrator/.cursor/projects/d-mithuuu/assets/cutout-pilot-propeller-showcase-cutout.webp"
);
const BUCKET = "mithron-products";
const CUTOUT_VARIANT_ID = "catalog-cutout-v1";

function loadProjectEnv() {
  for (const envPath of [join(projectRoot, ".env.local"), join(projectRoot, ".env")]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
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

async function main() {
  loadProjectEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const cutoutBuffer = readFileSync(SOURCE_WEBP);
  const metadata = await sharp(cutoutBuffer, { failOn: "none" }).metadata();
  if (!metadata.hasAlpha) throw new Error("Cutout WebP missing alpha");
  if (metadata.width !== 1024 || metadata.height !== 1024) {
    throw new Error(`Expected 1024x1024, got ${metadata.width}x${metadata.height}`);
  }

  const normalizedSlug = PRODUCT_SLUG.replace(/^source-/, "");
  const contentHash = hashBuffer(cutoutBuffer);
  const storagePath = `catalog-cutouts/v1/${normalizedSlug}-${contentHash}.webp`;
  const mediaAssetId = `catalog.cutout.v1.${PRODUCT_SLUG}.${contentHash}`;
  const now = new Date().toISOString();
  const url = publicUrl(supabaseUrl, storagePath);

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, cutoutBuffer, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: true
  });
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const mediaRow = {
    id: mediaAssetId,
    bucket: BUCKET,
    folder: "catalog-cutouts/v1",
    storage_path: storagePath,
    public_url: url,
    mime_type: "image/webp",
    file_size_bytes: cutoutBuffer.byteLength,
    size_bytes: cutoutBuffer.byteLength,
    width: 1024,
    height: 1024,
    content_hash: contentHash,
    alt: PRODUCT_NAME,
    alt_text: PRODUCT_NAME,
    caption: PRODUCT_NAME,
    tags: ["catalog-cutout", PRODUCT_SLUG, "showcase-pilot"],
    visibility: "public",
    status: "published",
    is_visible: true,
    is_primary: false,
    upload_metadata: {
      source: "showcase-cutout-pilot-replace",
      product_slug: PRODUCT_SLUG,
      variant_id: CUTOUT_VARIANT_ID,
      uploaded_at: now
    },
    updated_at: now
  };

  const { error: mediaError } = await supabase.from("media_assets").upsert(mediaRow, { onConflict: "id" });
  if (mediaError) throw new Error(`media_assets upsert failed: ${mediaError.message}`);

  // Clear old cutout links so only the new asset is active (no ranking conflict)
  const { error: deleteError } = await supabase
    .from("product_media_assets")
    .delete()
    .eq("product_slug", PRODUCT_SLUG)
    .eq("usage", "cms")
    .eq("variant_id", CUTOUT_VARIANT_ID);
  if (deleteError) throw new Error(`old cutout link delete failed: ${deleteError.message}`);

  const { error: linkError } = await supabase.from("product_media_assets").insert({
    product_slug: PRODUCT_SLUG,
    media_asset_id: mediaAssetId,
    usage: "cms",
    variant_id: CUTOUT_VARIANT_ID,
    sort_order: -500,
    is_primary: false,
    alt_text: PRODUCT_NAME,
    caption: PRODUCT_NAME,
    metadata: {
      source: "showcase-cutout-pilot-replace",
      public_url: url,
      variant_id: CUTOUT_VARIANT_ID
    },
    updated_at: now
  });
  if (linkError) throw new Error(`product_media_assets insert failed: ${linkError.message}`);

  const mediaJson = {
    src: url,
    alt: PRODUCT_NAME,
    kind: "image",
    width: 1024,
    height: 1024
  };

  const { data: productUpdated, error: productError } = await supabase
    .from("mithron_products")
    .update({
      image: mediaJson,
      hero: mediaJson,
      gallery: [mediaJson],
      updated_at: now
    })
    .eq("slug", PRODUCT_SLUG)
    .select("slug,name");
  if (productError) throw new Error(`mithron_products update failed: ${productError.message}`);

  // Sync primary link to new cutout asset
  await supabase
    .from("product_media_assets")
    .delete()
    .eq("product_slug", PRODUCT_SLUG)
    .eq("usage", "primary");

  const { error: primaryError } = await supabase.from("product_media_assets").insert({
    product_slug: PRODUCT_SLUG,
    media_asset_id: mediaAssetId,
    usage: "primary",
    variant_id: null,
    sort_order: 0,
    is_primary: true,
    alt_text: PRODUCT_NAME,
    caption: PRODUCT_NAME,
    metadata: {
      source: "showcase-cutout-pilot-replace",
      public_url: url
    },
    updated_at: now
  });
  if (primaryError) throw new Error(`primary link insert failed: ${primaryError.message}`);

  console.log(
    JSON.stringify(
      {
        status: "replaced",
        productSlug: PRODUCT_SLUG,
        productName: PRODUCT_NAME,
        publicUrl: url,
        storagePath,
        mediaAssetId,
        bytes: cutoutBuffer.byteLength,
        width: 1024,
        height: 1024,
        productUpdated
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
