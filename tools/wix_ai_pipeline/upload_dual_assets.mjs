#!/usr/bin/env node
/**
 * Upload dual assets from pipeline staging:
 *   cutout → primary (image)
 *   hero   → hero + gallery[0]
 * Preserves existing wix-content Storage objects.
 * Deletes superseded live primary/hero Storage objects after successful rewrite.
 *
 * Usage:
 *   node tools/wix_ai_pipeline/upload_dual_assets.mjs --slug=<slug> [--dry-run]
 *   node tools/wix_ai_pipeline/upload_dual_assets.mjs --slug=<slug> --apply --confirm=UPLOAD_DUAL
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..");
const STAGING = join(projectRoot, "tools", ".wix-ai-pipeline");
const BUCKET = "mithron-products";
const CONFIRM = "UPLOAD_DUAL";
const REQUIRED_SIDE = 1000;

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  return {
    slug: (get("slug") || "").trim(),
    apply: args.includes("--apply"),
    confirm: get("confirm"),
    dryRun: !args.includes("--apply")
  };
}

function loadEnv() {
  for (const p of [join(projectRoot, ".env.local"), join(projectRoot, ".env")]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const [k, ...rest] = t.split("=");
      if (k && !process.env[k]) process.env[k] = rest.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

function hashBuffer(buf, n = 12) {
  return createHash("sha256").update(buf).digest("hex").slice(0, n);
}

function storagePathFromPublicUrl(src) {
  if (typeof src !== "string" || !src) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = src.indexOf(marker);
  if (idx >= 0) return decodeURIComponent(src.slice(idx + marker.length).split("?")[0]);
  // Also accept path-style already
  if (src.startsWith("products/")) return src.split("?")[0];
  return null;
}

async function upsertAsset(supabase, urlBase, {
  id, storagePath, buf, mime, width, height, folder, tags, uploadMetadata, now
}) {
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: mime,
    upsert: true
  });
  if (upErr) throw new Error(`upload failed ${storagePath}: ${upErr.message}`);
  const publicUrl = `${urlBase}/storage/v1/object/public/${BUCKET}/${storagePath}`;
  const contentHash = createHash("sha256").update(buf).digest("hex");
  const { error: rowErr } = await supabase.from("media_assets").upsert({
    id,
    bucket: BUCKET,
    storage_path: storagePath,
    public_url: publicUrl,
    mime_type: mime,
    width,
    height,
    file_size_bytes: buf.byteLength,
    size_bytes: buf.byteLength,
    content_hash: contentHash,
    folder,
    tags,
    upload_metadata: uploadMetadata ?? null,
    updated_at: now
  });
  if (rowErr) throw new Error(`media_assets upsert failed: ${rowErr.message}`);
  return publicUrl;
}

async function deleteSupersededDisplay(supabase, {
  slug,
  prevImageSrc,
  prevHeroSrc,
  newCutoutPath,
  newHeroPath
}) {
  const toDelete = [];
  for (const src of [prevImageSrc, prevHeroSrc]) {
    const path = storagePathFromPublicUrl(src);
    if (!path) continue;
    if (path === newCutoutPath || path === newHeroPath) continue;
    // Only delete previous display assets (ai-cutout / ai-hero / prior primary under products/{slug}/)
    const underSlug = path.startsWith(`products/${slug}/`);
    const isAi = path.includes("/ai-cutout/") || path.includes("/ai-hero/");
    const isWix = path.includes("/wix-content/");
    if (underSlug && !isWix && (isAi || path.startsWith(`products/${slug}/`))) {
      toDelete.push(path);
    }
  }
  const unique = [...new Set(toDelete)];
  const deleted = [];
  for (const path of unique) {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) {
      console.warn(`warn: failed to delete storage ${path}: ${error.message}`);
      continue;
    }
    deleted.push(path);
    // Detach media_assets rows for deleted paths (best-effort)
    const { data: rows } = await supabase
      .from("media_assets")
      .select("id")
      .eq("bucket", BUCKET)
      .eq("storage_path", path);
    if (rows?.length) {
      const ids = rows.map((r) => r.id);
      await supabase.from("product_media_assets").delete().in("media_asset_id", ids);
      await supabase.from("media_assets").delete().in("id", ids);
    }
  }
  return deleted;
}

async function main() {
  const options = parseArgs();
  if (!options.slug) throw new Error("--slug=<slug> required");
  if (options.apply && options.confirm !== CONFIRM) {
    throw new Error(`Live upload requires --apply --confirm=${CONFIRM}`);
  }
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const urlBase = url.replace(/\/$/, "");

  const reportPath = join(STAGING, options.slug, "report.json");
  if (!existsSync(reportPath)) throw new Error(`Missing report: ${reportPath}`);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const cutoutPath = report.outputs?.cutout_webp || report.outputs?.cutout;
  const heroPath = report.outputs?.hero_webp || report.outputs?.hero;
  if (!cutoutPath || !existsSync(cutoutPath)) throw new Error("Missing cutout export");
  if (!heroPath || !existsSync(heroPath)) throw new Error("Missing hero export");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: product, error: pErr } = await supabase
    .from("mithron_products")
    .select("slug,name,image,hero,gallery")
    .eq("slug", options.slug)
    .maybeSingle();
  if (pErr || !product) throw new Error(`Product not found: ${options.slug}`);

  const cutoutBuf = readFileSync(cutoutPath);
  const heroBuf = readFileSync(heroPath);
  const cutMeta = await sharp(cutoutBuf, { failOn: "none" }).metadata();
  const heroMeta = await sharp(heroBuf, { failOn: "none" }).metadata();

  if (cutMeta.width !== REQUIRED_SIDE || cutMeta.height !== REQUIRED_SIDE) {
    throw new Error(
      `Cutout must be ${REQUIRED_SIDE}×${REQUIRED_SIDE}, got ${cutMeta.width}×${cutMeta.height}`
    );
  }
  if (heroMeta.width !== REQUIRED_SIDE || heroMeta.height !== REQUIRED_SIDE) {
    throw new Error(
      `Hero must be ${REQUIRED_SIDE}×${REQUIRED_SIDE}, got ${heroMeta.width}×${heroMeta.height}`
    );
  }
  if (!cutoutBuf.byteLength || !heroBuf.byteLength) {
    throw new Error("Cutout/hero WebP is empty");
  }

  const cutHash = hashBuffer(cutoutBuf);
  const heroHash = hashBuffer(heroBuf);
  const now = new Date().toISOString();
  const prevImageSrc = typeof product.image?.src === "string" ? product.image.src : null;
  const prevHeroSrc = typeof product.hero?.src === "string" ? product.hero.src : null;

  const plan = {
    mode: options.dryRun ? "DRY_RUN" : "APPLIED",
    slug: options.slug,
    cutout: `products/${options.slug}/ai-cutout/${cutHash}.webp`,
    hero: `products/${options.slug}/ai-hero/${heroHash}.webp`,
    cutout_bytes: cutoutBuf.byteLength,
    hero_bytes: heroBuf.byteLength,
    cutout_dims: `${cutMeta.width}x${cutMeta.height}`,
    hero_dims: `${heroMeta.width}x${heroMeta.height}`,
    preserve_wix_content: true,
    will_delete_prev: [prevImageSrc, prevHeroSrc].filter(Boolean)
  };
  console.log(JSON.stringify(plan, null, 2));
  if (options.dryRun) return;

  // Detach current primary/gallery/hero display links only (do not delete Storage wix-content)
  await supabase.from("product_media_assets").delete().eq("product_slug", options.slug).eq("usage", "primary");
  await supabase.from("product_media_assets").delete().eq("product_slug", options.slug).eq("usage", "gallery");
  await supabase.from("product_media_assets").delete().eq("product_slug", options.slug).eq("usage", "hero");

  const cutoutUrl = await upsertAsset(supabase, urlBase, {
    id: `product.ai-cutout.${options.slug}.${cutHash}`,
    storagePath: plan.cutout,
    buf: cutoutBuf,
    mime: "image/webp",
    width: REQUIRED_SIDE,
    height: REQUIRED_SIDE,
    folder: `products/${options.slug}/ai-cutout`,
    tags: ["ai-cutout", options.slug, "dual-assets", "image-bucket"],
    uploadMetadata: {
      source: "ai-dual-assets",
      role: "cutout",
      quality: report.cutout_webp_meta?.quality ?? null,
      file_size_bytes: cutoutBuf.byteLength
    },
    now
  });
  const heroUrl = await upsertAsset(supabase, urlBase, {
    id: `product.ai-hero.${options.slug}.${heroHash}`,
    storagePath: plan.hero,
    buf: heroBuf,
    mime: "image/webp",
    width: REQUIRED_SIDE,
    height: REQUIRED_SIDE,
    folder: `products/${options.slug}/ai-hero`,
    tags: ["ai-hero", options.slug, "dual-assets", "image-bucket"],
    uploadMetadata: {
      source: "ai-dual-assets",
      role: "hero",
      quality: report.hero_webp_meta?.quality ?? null,
      file_size_bytes: heroBuf.byteLength
    },
    now
  });

  const cutoutJson = {
    src: cutoutUrl,
    alt: product.name,
    kind: "image",
    width: REQUIRED_SIDE,
    height: REQUIRED_SIDE
  };
  const heroJson = {
    src: heroUrl,
    alt: product.name,
    kind: "image",
    width: REQUIRED_SIDE,
    height: REQUIRED_SIDE
  };

  // Keep remaining non-hero gallery frames from previous gallery if they are wix-content
  const prevGallery = Array.isArray(product.gallery) ? product.gallery : [];
  const retained = prevGallery.filter((item) => {
    const src = typeof item?.src === "string" ? item.src : "";
    return src.includes("/wix-content/") && src !== heroUrl && src !== cutoutUrl;
  });
  const galleryJson = [heroJson, ...retained];

  await supabase.from("product_media_assets").insert([
    {
      product_slug: options.slug,
      media_asset_id: `product.ai-cutout.${options.slug}.${cutHash}`,
      usage: "primary",
      is_primary: true,
      sort_order: 0,
      alt_text: product.name,
      updated_at: now
    },
    {
      product_slug: options.slug,
      media_asset_id: `product.ai-hero.${options.slug}.${heroHash}`,
      usage: "gallery",
      is_primary: false,
      sort_order: 0,
      alt_text: product.name,
      updated_at: now
    }
  ]);

  const { error: updErr } = await supabase
    .from("mithron_products")
    .update({
      image: cutoutJson,
      hero: heroJson,
      gallery: galleryJson,
      updated_at: now
    })
    .eq("slug", options.slug);
  if (updErr) throw new Error(updErr.message);

  const deleted = await deleteSupersededDisplay(supabase, {
    slug: options.slug,
    prevImageSrc,
    prevHeroSrc,
    newCutoutPath: plan.cutout,
    newHeroPath: plan.hero
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        cutoutUrl,
        heroUrl,
        galleryCount: galleryJson.length,
        cutoutBytes: cutoutBuf.byteLength,
        heroBytes: heroBuf.byteLength,
        deletedPrev: deleted
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
