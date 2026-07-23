#!/usr/bin/env node
/**
 * Upload approved WebPs to mithron-products/.../ai-enhanced/
 * Archives originals under wix-content/_archive/ when meta has originalObjectPath.
 *
 * Approval:
 *   Move staging/{slug}/{slug}-0N.webp (+ .meta.json) → approved/{slug}/
 *   Then: node upload.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
const ROOT = __dirname;
const APPROVED = path.join(ROOT, "approved");
const PROCESSED = path.join(ROOT, "processed");
const STAGING = path.join(ROOT, "staging");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TARGET_BUCKET = process.env.SOURCE_BUCKET || process.env.BUCKET_NAME || "mithron-products";
const ARCHIVE = String(process.env.ARCHIVE_ORIGINALS || "1") !== "0";

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY) in .env");
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function walkApprovedImages(dir = APPROVED) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...walkApprovedImages(full));
    else if (/\.webp$/i.test(name) && !name.includes(".preview.")) out.push(full);
  }
  return out;
}

function findMeta(webpPath) {
  const base = webpPath.replace(/\.webp$/i, ".meta.json");
  const candidates = [
    base,
    path.join(path.dirname(webpPath), path.basename(base)),
    path.join(STAGING, path.relative(APPROVED, path.dirname(webpPath)), path.basename(base)),
    path.join(STAGING, path.basename(base)),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        return { meta: JSON.parse(fs.readFileSync(c, "utf8")), metaFile: c };
      } catch {
        /* continue */
      }
    }
  }
  return { meta: null, metaFile: null };
}

function resolveUploadTarget(webpPath, meta) {
  if (meta?.uploadPath) {
    return { bucket: meta.sourceBucket || TARGET_BUCKET, objectPath: meta.uploadPath };
  }
  // Fallback: products/{slug}/ai-enhanced/{filename}
  const rel = path.relative(APPROVED, webpPath).replace(/\\/g, "/");
  const parts = rel.split("/");
  const fileName = parts[parts.length - 1];
  const slug = parts.length > 1 ? parts[0] : path.parse(fileName).name.replace(/-\d{2}$/, "");
  return {
    bucket: TARGET_BUCKET,
    objectPath: `products/${slug}/ai-enhanced/${fileName}`,
  };
}

async function archiveOriginal(supabase, bucket, originalPath) {
  if (!ARCHIVE || !originalPath) return;
  const parts = originalPath.split("/");
  const fileName = parts.pop();
  const archivePath = [...parts, "_archive", fileName].join("/");
  log(`Archive ${bucket}/${originalPath} -> ${archivePath}`);

  const { data, error } = await supabase.storage.from(bucket).download(originalPath);
  if (error) {
    log(`Warning: archive download failed: ${error.message}`);
    return;
  }
  const buf = Buffer.from(await data.arrayBuffer());
  const up = await supabase.storage.from(bucket).upload(archivePath, buf, {
    contentType: contentTypeFor(fileName),
    upsert: true,
    cacheControl: "3600",
  });
  if (up.error) {
    log(`Warning: archive upload failed: ${up.error.message}`);
    return;
  }
}

async function uploadOne(supabase, filePath) {
  const fileName = path.basename(filePath);
  const { meta, metaFile } = findMeta(filePath);
  const { bucket, objectPath } = resolveUploadTarget(filePath, meta);
  const buf = fs.readFileSync(filePath);
  const contentType = contentTypeFor(filePath);

  log(`Uploading ${fileName} -> ${bucket}/${objectPath} (${buf.length} bytes)`);

  if (meta?.originalObjectPath) {
    await archiveOriginal(supabase, meta.sourceBucket || bucket, meta.originalObjectPath);
  }

  const { error } = await supabase.storage.from(bucket).upload(objectPath, buf, {
    contentType,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw new Error(`Upload failed for ${objectPath}: ${error.message}`);

  const destDir = path.join(PROCESSED, path.relative(APPROVED, path.dirname(filePath)));
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, fileName);
  fs.renameSync(filePath, dest);
  if (metaFile && fs.existsSync(metaFile) && metaFile.startsWith(APPROVED)) {
    fs.renameSync(metaFile, path.join(destDir, path.basename(metaFile)));
  } else if (metaFile && fs.existsSync(metaFile)) {
    fs.copyFileSync(metaFile, path.join(destDir, path.basename(metaFile)));
  }

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  log(`OK processed: ${dest}`);
  log(`Public URL: ${pub?.publicUrl || "(n/a)"}`);
  return { objectPath, publicUrl: pub?.publicUrl || null };
}

async function main() {
  fs.mkdirSync(APPROVED, { recursive: true });
  fs.mkdirSync(PROCESSED, { recursive: true });

  const files = walkApprovedImages();
  if (!files.length) {
    log("No images in approved/. Manual approval:");
    log("  1) Review staging/{slug}/*.webp (+ .preview.png)");
    log("  2) Move approved WebP + .meta.json into approved/{slug}/");
    log("  3) Re-run: node upload.js");
    process.exit(0);
  }

  const supabase = getSupabase();
  log(`Uploading ${files.length} approved image(s) to ${TARGET_BUCKET}...`);
  for (const file of files) {
    await uploadOne(supabase, file);
  }
  log("upload.js finished.");
}

main().catch((err) => {
  console.error("\nFATAL:", err.message || err);
  process.exit(1);
});
