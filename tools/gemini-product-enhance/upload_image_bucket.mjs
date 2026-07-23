#!/usr/bin/env node
/**
 * Safe IMAGE BUCKET → Supabase replace (5-step per product):
 *   1 Upload new → 2 Verify upload → 3 Update ALL image DB fields
 *   → 4 Verify DB → 5 Delete ALL old storage under products/{slug}/
 *
 * Requires audit-image-bucket-map.json with ok_to_upload=true (or --only matched).
 *
 * Usage:
 *   node upload_image_bucket.mjs --dry-run
 *   node upload_image_bucket.mjs --only=source-drone-soccer-200-mm --apply --confirm=REPLACE_PRODUCT_IMAGES
 *   node upload_image_bucket.mjs --apply --confirm=REPLACE_PRODUCT_IMAGES
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { uploadCutoutVariants } from "./ai_cutout_variants.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const AUDIT_FILE = path.join(__dirname, "audit-image-bucket-map.json");
const RUN_LOG = path.join(__dirname, "upload-image-bucket-log.jsonl");
const BUCKET = "mithron-products";
const CONFIRM = "REPLACE_PRODUCT_IMAGES";
const SIDE = 1000;

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (n) => {
    const hit = args.find((a) => a.startsWith(`--${n}=`));
    return hit ? hit.slice(n.length + 3) : null;
  };
  return {
    apply: args.includes("--apply"),
    dryRun: !args.includes("--apply"),
    confirm: get("confirm"),
    only: (get("only") || "").trim(),
    limit: Number(get("limit") || 0) || 0,
  };
}

function log(...a) {
  console.log(`[${new Date().toISOString()}]`, ...a);
}

function appendLog(entry) {
  fs.appendFileSync(RUN_LOG, JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n");
}

function hashBuffer(buf, n = 12) {
  return createHash("sha256").update(buf).digest("hex").slice(0, n);
}

function storagePathFromPublicUrl(src) {
  if (typeof src !== "string" || !src) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = src.indexOf(marker);
  if (idx >= 0) return decodeURIComponent(src.slice(idx + marker.length).split("?")[0]);
  if (src.startsWith("products/")) return src.split("?")[0];
  return null;
}

function collectOldPaths(product) {
  const paths = new Set();
  const push = (src) => {
    const p = storagePathFromPublicUrl(src);
    if (p && p.startsWith(`products/${product.slug}/`)) paths.add(p);
  };
  if (product.image?.src) push(product.image.src);
  if (product.hero?.src) push(product.hero.src);
  if (product.og_image?.src) push(product.og_image.src);
  for (const g of Array.isArray(product.gallery) ? product.gallery : []) {
    if (g?.src) push(g.src);
  }
  for (const s of Array.isArray(product.source_images) ? product.source_images : []) {
    if (typeof s === "string") push(s);
    else if (s?.src) push(s.src);
  }
  return [...paths];
}

async function listAllUnderPrefix(supabase, prefix) {
  const out = [];
  const queue = [prefix.replace(/\/$/, "")];
  while (queue.length) {
    const folder = queue.shift();
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, {
      limit: 1000,
      offset: 0,
    });
    if (error) {
      // empty / missing is fine
      continue;
    }
    for (const item of data || []) {
      const full = `${folder}/${item.name}`;
      // folders often have id null and no metadata.size
      if (item.id == null && !item.metadata) {
        queue.push(full);
      } else if (item.name && !item.name.endsWith("/")) {
        // Heuristic: if metadata exists treat as file; also push if it looks like a file ext
        if (item.metadata || /\.[a-z0-9]+$/i.test(item.name)) {
          out.push(full);
        } else {
          queue.push(full);
        }
      }
    }
  }
  return out;
}

async function verifyPublicUrl(url) {
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) {
    // some CDNs dislike HEAD — try GET range
    const res2 = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-16" },
    });
    if (!res2.ok) throw new Error(`verify upload failed HTTP ${res2.status} for ${url}`);
    return;
  }
}

async function upsertAsset(supabase, urlBase, {
  id,
  storagePath,
  buf,
  width,
  height,
  folder,
  tags,
  uploadMetadata,
  now,
}) {
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: "image/webp",
    upsert: true,
  });
  if (upErr) throw new Error(`upload failed ${storagePath}: ${upErr.message}`);
  const publicUrl = `${urlBase}/storage/v1/object/public/${BUCKET}/${storagePath}`;

  // ADD thumbnail + medium beside master (never deletes master).
  const { responsiveVariants, keepPaths: variantPaths } = await uploadCutoutVariants(
    supabase,
    urlBase,
    {
      masterStoragePath: storagePath,
      masterBuf: buf,
      masterWidth: width,
      masterHeight: height,
      masterPublicUrl: publicUrl,
    }
  );

  const contentHash = createHash("sha256").update(buf).digest("hex");
  const { error: rowErr } = await supabase.from("media_assets").upsert({
    id,
    bucket: BUCKET,
    storage_path: storagePath,
    public_url: publicUrl,
    mime_type: "image/webp",
    width,
    height,
    file_size_bytes: buf.byteLength,
    size_bytes: buf.byteLength,
    content_hash: contentHash,
    folder,
    tags,
    upload_metadata: uploadMetadata ?? null,
    responsive_variants: responsiveVariants,
    updated_at: now,
  });
  if (rowErr) throw new Error(`media_assets upsert failed: ${rowErr.message}`);
  return { publicUrl, variantPaths };
}

function mediaJson(url, alt) {
  return { src: url, alt, kind: "image", width: SIDE, height: SIDE };
}

async function replaceOne(supabase, urlBase, job, { dryRun }) {
  const { data: product, error: pErr } = await supabase
    .from("mithron_products")
    .select("slug,name,image,hero,gallery,source_images,og_image")
    .eq("slug", job.slug)
    .maybeSingle();
  if (pErr || !product) throw new Error(`Product not found: ${job.slug}`);

  const oldPathsFromDb = collectOldPaths(product);
  const files = [];
  for (const w of job.webps) {
    const buf = fs.readFileSync(w.path);
    if (buf.byteLength < 10 * 1024) throw new Error(`Tiny file ${w.path}`);
    const meta = await sharp(buf, { failOn: "none" }).metadata();
    if (meta.width !== SIDE || meta.height !== SIDE) {
      throw new Error(`${w.file} must be ${SIDE}x${SIDE}, got ${meta.width}x${meta.height}`);
    }
    const nn = w.file.replace(/\.webp$/i, "");
    const h = hashBuffer(buf);
    const storagePath = `products/${job.slug}/ai-cutout/${nn}-${h}.webp`;
    files.push({ nn, file: w.file, buf, storagePath, hash: h, bytes: buf.byteLength });
  }

  const plan = {
    slug: job.slug,
    folder: job.folder,
    uploads: files.map((f) => ({ path: f.storagePath, bytes: f.bytes })),
    oldDbPaths: oldPathsFromDb,
  };
  if (dryRun) {
    log(`DRY ${job.slug}: upload ${files.length}, then wipe old under products/${job.slug}/`);
    return { dryRun: true, ...plan };
  }

  const now = new Date().toISOString();
  const keepPaths = new Set(files.map((f) => f.storagePath));
  const uploaded = [];

  // —— 1 Upload new (+ thumbnail/medium variants) ——
  for (const f of files) {
    const { publicUrl: url, variantPaths } = await upsertAsset(supabase, urlBase, {
      id: `product.ai-cutout.${job.slug}.${f.nn}.${f.hash}`,
      storagePath: f.storagePath,
      buf: f.buf,
      width: SIDE,
      height: SIDE,
      folder: `products/${job.slug}/ai-cutout`,
      tags: ["ai-cutout", job.slug, "image-bucket-replace"],
      uploadMetadata: {
        source: "image-bucket-replace",
        nn: f.nn,
        local_file: f.file,
        file_size_bytes: f.bytes,
      },
      now,
    });
    for (const vp of variantPaths) keepPaths.add(vp);
    uploaded.push({ ...f, url });
  }

  // —— 2 Verify upload ——
  for (const u of uploaded) {
    await verifyPublicUrl(u.url);
    const { data: listed, error } = await supabase.storage.from(BUCKET).list(
      `products/${job.slug}/ai-cutout`,
      { search: path.basename(u.storagePath) }
    );
    if (error) throw new Error(`list verify failed: ${error.message}`);
    const found = (listed || []).some((x) => x.name === path.basename(u.storagePath));
    if (!found) throw new Error(`storage object missing after upload: ${u.storagePath}`);
  }

  const primary = uploaded[0];
  const galleryItems = uploaded.slice(1);
  const primaryJson = mediaJson(primary.url, product.name);
  const galleryJson = galleryItems.map((u) => mediaJson(u.url, product.name));
  // hero is NOT NULL — set to primary cutout (no separate old hero)
  const heroJson = primaryJson;
  const sourceImagesJson = uploaded.map((u) => u.url);
  const ogJson = primaryJson;

  const prevSnapshot = {
    image: product.image,
    hero: product.hero,
    gallery: product.gallery,
    source_images: product.source_images,
    og_image: product.og_image,
  };

  // —— 3 Update ALL image DB fields ——
  await supabase.from("product_media_assets").delete().eq("product_slug", job.slug);

  const linkRows = uploaded.map((u, i) => ({
    product_slug: job.slug,
    media_asset_id: `product.ai-cutout.${job.slug}.${u.nn}.${u.hash}`,
    usage: i === 0 ? "primary" : "gallery",
    is_primary: i === 0,
    sort_order: i,
    alt_text: product.name,
    updated_at: now,
  }));
  if (linkRows.length) {
    const { error: linkErr } = await supabase.from("product_media_assets").insert(linkRows);
    if (linkErr) throw new Error(`product_media_assets insert: ${linkErr.message}`);
  }

  const { error: updErr } = await supabase
    .from("mithron_products")
    .update({
      image: primaryJson,
      hero: heroJson,
      gallery: galleryJson,
      source_images: sourceImagesJson,
      og_image: ogJson,
      updated_at: now,
    })
    .eq("slug", job.slug);
  if (updErr) throw new Error(`mithron_products update: ${updErr.message}`);

  // —— 4 Verify DB ——
  const { data: verifyRow, error: vErr } = await supabase
    .from("mithron_products")
    .select("image,hero,gallery,source_images,og_image")
    .eq("slug", job.slug)
    .single();
  if (vErr) throw new Error(`DB verify read failed: ${vErr.message}`);

  const expectedUrls = new Set(uploaded.map((u) => u.url));
  const checkUrl = (src, label) => {
    if (!src || !expectedUrls.has(src)) {
      throw new Error(`DB verify failed ${label}: unexpected src ${src}`);
    }
  };
  checkUrl(verifyRow.image?.src, "image");
  checkUrl(verifyRow.hero?.src, "hero");
  checkUrl(verifyRow.og_image?.src, "og_image");
  for (const g of verifyRow.gallery || []) checkUrl(g?.src, "gallery");
  for (const s of verifyRow.source_images || []) {
    const src = typeof s === "string" ? s : s?.src;
    checkUrl(src, "source_images");
  }

  // —— 5 Delete ALL old storage under products/{slug}/ except keep-set ——
  const listedAll = await listAllUnderPrefix(supabase, `products/${job.slug}`);
  const toDelete = [
    ...new Set([...listedAll, ...oldPathsFromDb].filter((p) => p && !keepPaths.has(p))),
  ];
  const deleted = [];
  // chunk deletes
  for (let i = 0; i < toDelete.length; i += 50) {
    const chunk = toDelete.slice(i, i + 50);
    const { error: delErr } = await supabase.storage.from(BUCKET).remove(chunk);
    if (delErr) {
      log(`warn delete chunk: ${delErr.message}`);
    } else {
      deleted.push(...chunk);
    }
  }

  // Clean media_assets for deleted paths
  for (const p of deleted) {
    const { data: rows } = await supabase
      .from("media_assets")
      .select("id")
      .eq("bucket", BUCKET)
      .eq("storage_path", p);
    if (rows?.length) {
      const ids = rows.map((r) => r.id);
      await supabase.from("product_media_assets").delete().in("media_asset_id", ids);
      await supabase.from("media_assets").delete().in("id", ids);
    }
  }

  return {
    ok: true,
    slug: job.slug,
    uploaded: uploaded.map((u) => ({ path: u.storagePath, url: u.url, bytes: u.bytes })),
    deletedCount: deleted.length,
    deletedSample: deleted.slice(0, 8),
    prevSnapshotKeys: Object.keys(prevSnapshot),
  };
}

async function main() {
  const opts = parseArgs();
  if (opts.apply && opts.confirm !== CONFIRM) {
    throw new Error(`Live replace requires --apply --confirm=${CONFIRM}`);
  }
  if (!fs.existsSync(AUDIT_FILE)) {
    throw new Error(`Missing ${AUDIT_FILE} — run node audit_image_bucket_map.mjs first`);
  }
  const audit = JSON.parse(fs.readFileSync(AUDIT_FILE, "utf8"));
  if (!audit.ok_to_upload && !opts.only) {
    throw new Error("Audit ok_to_upload=false — fix misses before full apply");
  }

  let jobs = audit.matched || [];
  if (opts.only) {
    jobs = jobs.filter(
      (j) =>
        j.slug.includes(opts.only) ||
        j.folder.toLowerCase().includes(opts.only.toLowerCase())
    );
    if (!jobs.length) throw new Error(`No matched job for --only=${opts.only}`);
  }
  if (opts.limit > 0) jobs = jobs.slice(0, opts.limit);
  if (!jobs.length) throw new Error("No jobs to process");

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  const urlBase = url.replace(/\/$/, "");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  log(
    `=== upload_image_bucket mode=${opts.dryRun ? "DRY_RUN" : "APPLY"} jobs=${jobs.length} ===`
  );
  appendLog({ event: "start", mode: opts.dryRun ? "dry" : "apply", count: jobs.length });

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    log(`[${i + 1}/${jobs.length}] ${job.slug} ← ${job.folder} (${job.webpCount} webp)`);
    try {
      const result = await replaceOne(supabase, urlBase, job, { dryRun: opts.dryRun });
      if (result.ok) {
        log(
          `  OK uploaded=${result.uploaded.length} deleted=${result.deletedCount} primary=${result.uploaded[0]?.url}`
        );
      }
      appendLog({ event: opts.dryRun ? "dry" : "ok", ...result });
      ok++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`  FAIL ${msg}`);
      appendLog({ event: "fail", slug: job.slug, error: msg });
      fail++;
      // On DB verify failure after update we already threw; leave new uploads (safe). Do not continue wipe.
    }
  }

  log(`\nDone. ok=${ok} fail=${fail}`);
  appendLog({ event: "end", ok, fail });
  process.exitCode = fail ? 2 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
