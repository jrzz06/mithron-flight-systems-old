#!/usr/bin/env node
/**
 * Upload pipeline exports for one product — keeps FULL gallery (no collapse).
 * Usage: node tools/wix_ai_pipeline/upload_product.mjs --slug source-10-liter-dual-agri-drone [--dry-run]
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
const CUTOUT_VARIANT_ID = "catalog-cutout-v1";

function parseArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--slug");
  return { slug: (i >= 0 ? args[i + 1] : "").trim(), dryRun: args.includes("--dry-run") };
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

async function main() {
  const { slug, dryRun } = parseArgs();
  if (!slug) throw new Error("--slug required");
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");

  const reportPath = join(STAGING, slug, "report.json");
  if (!existsSync(reportPath)) throw new Error(`Missing report: ${reportPath}`);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const winFrames = (report.frames || []).filter((f) => f.verdict === "WIN" && f.exports?.webp);
  if (!winFrames.length) throw new Error("No WIN frames to upload");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: product, error: pErr } = await supabase
    .from("mithron_products")
    .select("slug,name")
    .eq("slug", slug)
    .maybeSingle();
  if (pErr || !product) throw new Error(`Product not found: ${slug}`);

  const normalized = slug.replace(/^source-/, "");
  const now = new Date().toISOString();

  if (!dryRun) {
    await supabase.from("product_media_assets").delete().eq("product_slug", slug).eq("usage", "gallery");
    await supabase.from("product_media_assets").delete().eq("product_slug", slug).eq("usage", "primary");
    await supabase.from("product_media_assets").delete().eq("product_slug", slug).eq("variant_id", CUTOUT_VARIANT_ID);
  }

  const galleryJson = [];
  let primaryJson = null;
  let cutoutUrl = null;

  for (let i = 0; i < winFrames.length; i++) {
    const frame = winFrames[i];
    const buf = readFileSync(frame.exports.webp);
    const meta = await sharp(buf, { failOn: "none" }).metadata();
    const contentHash = hashBuffer(buf);
    const isPrimary = i === 0;
    const storagePath = isPrimary
      ? `catalog-cutouts/v1/${normalized}-${contentHash}.webp`
      : `products/${slug}/${contentHash}-g${i}.webp`;
    const mediaAssetId = isPrimary
      ? `catalog.cutout.v1.${slug}.${contentHash}`
      : `product.gallery.${slug}.${contentHash}`;

    if (dryRun) {
      console.log(JSON.stringify({ dryRun: true, i, storagePath, bytes: buf.length, w: meta.width, h: meta.height }));
      continue;
    }

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
      contentType: "image/webp",
      upsert: true
    });
    if (upErr) throw new Error(`upload failed: ${upErr.message}`);

    const publicUrl = `${url.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${storagePath}`;
    await supabase.from("media_assets").upsert({
      id: mediaAssetId,
      bucket: BUCKET,
      storage_path: storagePath,
      public_url: publicUrl,
      mime_type: "image/webp",
      width: meta.width ?? null,
      height: meta.height ?? null,
      file_size_bytes: buf.byteLength,
      size_bytes: buf.byteLength,
      folder: isPrimary ? "catalog-cutouts/v1" : `products/${slug}`,
      tags: isPrimary ? ["catalog-cutout", slug, "wix-ai-pipeline"] : ["gallery", slug, "wix-ai-pipeline"],
      metadata: { source: "wix-ai-pipeline", frame: i },
      updated_at: now
    });

    const mediaJson = {
      src: publicUrl,
      alt: product.name,
      kind: "image",
      width: meta.width ?? 1024,
      height: meta.height ?? 1024
    };
    galleryJson.push(mediaJson);

    if (isPrimary) {
      primaryJson = mediaJson;
      cutoutUrl = publicUrl;
      await supabase.from("product_media_assets").insert({
        product_slug: slug,
        media_asset_id: mediaAssetId,
        usage: "cms",
        variant_id: CUTOUT_VARIANT_ID,
        sort_order: -500,
        is_primary: false,
        alt_text: product.name,
        metadata: { source: "wix-ai-pipeline", public_url: publicUrl, variant_id: CUTOUT_VARIANT_ID },
        updated_at: now
      });
      await supabase.from("product_media_assets").insert({
        product_slug: slug,
        media_asset_id: mediaAssetId,
        usage: "primary",
        variant_id: null,
        sort_order: 0,
        is_primary: true,
        alt_text: product.name,
        metadata: { source: "wix-ai-pipeline", public_url: publicUrl },
        updated_at: now
      });
    } else {
      await supabase.from("product_media_assets").insert({
        product_slug: slug,
        media_asset_id: mediaAssetId,
        usage: "gallery",
        variant_id: null,
        sort_order: i,
        is_primary: false,
        alt_text: product.name,
        metadata: { source: "wix-ai-pipeline", public_url: publicUrl },
        updated_at: now
      });
    }
  }

  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, frames: winFrames.length }, null, 2));
    return;
  }

  const { error: updErr } = await supabase
    .from("mithron_products")
    .update({
      image: primaryJson,
      hero: primaryJson,
      gallery: galleryJson,
      updated_at: now
    })
    .eq("slug", slug);
  if (updErr) throw new Error(updErr.message);

  console.log(
    JSON.stringify({ status: "replaced", slug, cutoutUrl, galleryCount: galleryJson.length, primary: primaryJson?.src }, null, 2)
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
