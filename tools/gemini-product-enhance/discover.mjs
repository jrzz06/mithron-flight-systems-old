import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Discover all product images under mithron-products/products/{slug}/wix-content/
// Writes manifest.json for run_batch.mjs

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SOURCE_BUCKET = process.env.SOURCE_BUCKET || process.env.BUCKET_NAME || "mithron-products";
const PRODUCTS_PREFIX = (process.env.PRODUCTS_PREFIX || "products").replace(/^\/+|\/+$/g, "");
const OUT = path.join(__dirname, "manifest.json");
const ONLY_MATCH = (process.env.ONLY_MATCH || "").trim().toLowerCase();
const LIMIT = Number(process.env.DISCOVER_LIMIT || 0);

function log(...a) {
  console.log(`[${new Date().toISOString()}]`, ...a);
}

function isImage(name) {
  return /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(name || "");
}

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Missing SUPABASE_URL / key in .env");
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function listDir(supabase, bucket, folder) {
  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    limit: 1000,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new Error(`list ${bucket}/${folder}: ${error.message}`);
  return data || [];
}

async function main() {
  const supabase = getSupabase();
  log(`Discovering ${SOURCE_BUCKET}/${PRODUCTS_PREFIX}/{slug}/wix-content ...`);

  const productDirs = await listDir(supabase, SOURCE_BUCKET, PRODUCTS_PREFIX);
  const slugs = productDirs
    .filter((d) => d?.name && !d.name.includes(".") && !isImage(d.name))
    .map((d) => d.name)
    .sort();

  log(`Found ${slugs.length} product folder(s)`);

  const jobs = [];
  for (const slug of slugs) {
    if (ONLY_MATCH && !slug.toLowerCase().includes(ONLY_MATCH)) continue;

    const wixFolder = `${PRODUCTS_PREFIX}/${slug}/wix-content`;
    let entries = [];
    try {
      entries = await listDir(supabase, SOURCE_BUCKET, wixFolder);
    } catch (err) {
      log(`Skip ${slug}: ${err.message || err}`);
      continue;
    }

    const images = entries
      .filter((f) => f?.name && isImage(f.name) && !f.name.startsWith("_"))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!images.length) continue;

    images.forEach((img, idx) => {
      const index = idx + 1;
      const suffix = String(index).padStart(2, "0");
      const stagingName = `${slug}-${suffix}.webp`;
      jobs.push({
        id: `${slug}:${suffix}`,
        slug,
        index,
        suffix,
        stagingName,
        sourceBucket: SOURCE_BUCKET,
        sourcePath: `${wixFolder}/${img.name}`,
        sourceName: img.name,
        sourceSize: img.metadata?.size ?? null,
        uploadPath: `${PRODUCTS_PREFIX}/${slug}/ai-enhanced/${stagingName}`,
      });
    });

    if (LIMIT > 0 && jobs.length >= LIMIT) break;
  }

  const limited = LIMIT > 0 ? jobs.slice(0, LIMIT) : jobs;
  const bySlug = {};
  for (const j of limited) {
    bySlug[j.slug] = (bySlug[j.slug] || 0) + 1;
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    sourceBucket: SOURCE_BUCKET,
    productsPrefix: PRODUCTS_PREFIX,
    productCount: Object.keys(bySlug).length,
    imageCount: limited.length,
    jobs: limited,
  };

  fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
  log(`Wrote ${OUT}`);
  log(`Products: ${manifest.productCount}  Images: ${manifest.imageCount}`);
  if (ONLY_MATCH) log(`ONLY_MATCH=${ONLY_MATCH}`);
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
