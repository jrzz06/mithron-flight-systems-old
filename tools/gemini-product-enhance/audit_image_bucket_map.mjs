#!/usr/bin/env node
/**
 * Live audit: mithron_products ↔ D:\mithuuu\IMAGE BUCKET
 * Exit 0 only when ok_to_upload is true for the IMAGE BUCKET set
 * (every folder maps to exactly one product; no orphans).
 *
 * Usage:
 *   node audit_image_bucket_map.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const IMAGE_BUCKET = path.join("D:", "mithuuu", "IMAGE BUCKET");
const NAMES_FILE = path.join(__dirname, "product-names.json");
const ALIASES_FILE = path.join(__dirname, "folder-aliases.json");
const OUT_FILE = path.join(__dirname, "audit-image-bucket-map.json");
const MIN_BYTES = 10 * 1024;

function sanitizeFolderName(name) {
  let s = String(name || "").trim();
  s = s.replace(/[/\\:]/g, "-");
  s = s.replace(/[<>"|?*]/g, "");
  s = s.replace(/\s+/g, " ").replace(/^[.\s]+|[.\s]+$/g, "");
  s = s.replace(/[\u2010-\u2015\u2212]/g, "-");
  return s || "unknown-product";
}

function normalizeKey(s) {
  return sanitizeFolderName(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function listBucketFolders() {
  if (!fs.existsSync(IMAGE_BUCKET)) {
    throw new Error(`IMAGE BUCKET missing: ${IMAGE_BUCKET}`);
  }
  const folders = [];
  for (const name of fs.readdirSync(IMAGE_BUCKET)) {
    const full = path.join(IMAGE_BUCKET, name);
    if (!fs.statSync(full).isDirectory()) continue;
    const webps = fs
      .readdirSync(full)
      .filter((f) => /^\d{2}\.webp$/i.test(f))
      .map((f) => {
        const p = path.join(full, f);
        return { file: f, path: p, bytes: fs.statSync(p).size };
      })
      .sort((a, b) => a.file.localeCompare(b.file));
    const valid = webps.filter((w) => w.bytes >= MIN_BYTES);
    folders.push({
      folder: name,
      path: full,
      webpCount: valid.length,
      webps: valid,
      tinyOrEmpty: webps.filter((w) => w.bytes < MIN_BYTES).map((w) => w.file),
    });
  }
  return folders.sort((a, b) => a.folder.localeCompare(b.folder));
}

async function fetchAllProducts(supabase) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await supabase
      .from("mithron_products")
      .select("slug,name,image,hero,gallery,source_images,og_image")
      .order("slug")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function countSrc(field) {
  if (!field) return 0;
  if (Array.isArray(field)) return field.filter((x) => x?.src).length;
  if (typeof field === "object" && field.src) return 1;
  return 0;
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SERVICE_ROLE_KEY in .env");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nameMap = fs.existsSync(NAMES_FILE)
    ? JSON.parse(fs.readFileSync(NAMES_FILE, "utf8"))
    : {};
  const aliases = fs.existsSync(ALIASES_FILE)
    ? JSON.parse(fs.readFileSync(ALIASES_FILE, "utf8"))
    : {};

  const products = await fetchAllProducts(supabase);
  const folders = listBucketFolders();

  const folderByExact = new Map(folders.map((f) => [f.folder, f]));
  const folderByNorm = new Map();
  for (const f of folders) {
    const k = normalizeKey(f.folder);
    if (!folderByNorm.has(k)) folderByNorm.set(k, []);
    folderByNorm.get(k).push(f);
  }

  const matched = [];
  const missingBucket = [];
  const nameMismatch = [];
  const usedFolders = new Set();
  const collisions = [];

  for (const p of products) {
    const display = nameMap[p.slug] || p.name;
    const aliasFolder = aliases[p.slug] || aliases[display] || null;
    const candidates = [
      aliasFolder,
      sanitizeFolderName(display),
      sanitizeFolderName(p.name),
      display,
      p.name,
    ].filter(Boolean);

    let hit = null;
    let how = null;
    for (const c of candidates) {
      if (folderByExact.has(c)) {
        hit = folderByExact.get(c);
        how = "exact";
        break;
      }
    }
    if (!hit) {
      for (const c of candidates) {
        const list = folderByNorm.get(normalizeKey(c)) || [];
        if (list.length === 1) {
          hit = list[0];
          how = "normalized";
          break;
        }
        if (list.length > 1) {
          collisions.push({ slug: p.slug, name: p.name, candidates: list.map((x) => x.folder) });
        }
      }
    }

    if (!hit) {
      missingBucket.push({
        slug: p.slug,
        name: p.name,
        expectedFolder: sanitizeFolderName(display),
        dbImageCount:
          countSrc(p.image) + countSrc(p.hero) + countSrc(p.gallery) + countSrc(p.source_images),
      });
      continue;
    }

    if (usedFolders.has(hit.folder)) {
      collisions.push({
        slug: p.slug,
        name: p.name,
        folder: hit.folder,
        note: "folder already claimed by another product",
      });
      continue;
    }
    usedFolders.add(hit.folder);

    if (hit.folder !== sanitizeFolderName(display)) {
      nameMismatch.push({
        slug: p.slug,
        name: p.name,
        expected: sanitizeFolderName(display),
        actualFolder: hit.folder,
        match: how,
      });
    }

    matched.push({
      slug: p.slug,
      name: p.name,
      folder: hit.folder,
      folderPath: hit.path,
      webpCount: hit.webpCount,
      webps: hit.webps.map((w) => ({ file: w.file, path: w.path, bytes: w.bytes })),
      tinyOrEmpty: hit.tinyOrEmpty,
      match: how,
      ok: hit.webpCount > 0 && hit.tinyOrEmpty.length === 0,
    });
  }

  const orphanFolder = folders
    .filter((f) => !usedFolders.has(f.folder))
    .map((f) => ({ folder: f.folder, webpCount: f.webpCount }));

  const matchedOk = matched.filter((m) => m.ok);
  const matchedBad = matched.filter((m) => !m.ok);

  // Upload set = all IMAGE BUCKET folders uniquely matched. missing_bucket products are excluded.
  const ok_to_upload =
    orphanFolder.length === 0 &&
    matchedBad.length === 0 &&
    collisions.length === 0 &&
    matchedOk.length === folders.length;

  const report = {
    at: new Date().toISOString(),
    imageBucket: IMAGE_BUCKET,
    counts: {
      supabaseProducts: products.length,
      imageBucketFolders: folders.length,
      imageBucketWebps: folders.reduce((n, f) => n + f.webpCount, 0),
      matched: matched.length,
      matchedOk: matchedOk.length,
      matchedBad: matchedBad.length,
      missingBucket: missingBucket.length,
      orphanFolder: orphanFolder.length,
      nameMismatch: nameMismatch.length,
      collisions: collisions.length,
    },
    ok_to_upload,
    matched: matchedOk,
    matchedBad,
    missingBucket,
    orphanFolder,
    nameMismatch,
    collisions,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.counts, null, 2));
  console.log(`ok_to_upload: ${ok_to_upload}`);
  if (orphanFolder.length) console.log("\nORPHAN FOLDERS:", orphanFolder);
  if (missingBucket.length) {
    console.log(
      `\nMISSING BUCKET (${missingBucket.length}) — excluded from upload:`,
      missingBucket.map((x) => x.slug)
    );
  }
  if (matchedBad.length) console.log("\nMATCHED BAD:", matchedBad);
  if (collisions.length) console.log("\nCOLLISIONS:", collisions);
  if (nameMismatch.length) {
    console.log(`\nNAME MISMATCHES (${nameMismatch.length}):`, nameMismatch.slice(0, 15));
  }
  console.log(`\nWrote ${OUT_FILE}`);
  process.exitCode = ok_to_upload ? 0 : 2;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
