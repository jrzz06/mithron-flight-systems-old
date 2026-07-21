/**
 * Batch clarity/detail enhance for catalog cutouts — preserves alpha + geometry.
 * Does NOT upload. Writes before/after under tools/.cutout-batch-01/
 * Usage: node tools/batch-clarity-cutouts.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const outRoot = join(projectRoot, "tools", ".cutout-batch-01");

const PRODUCTS = [
  {
    slug: "source-10-liter-dual-agri-drone",
    name: "10 Liter Dual Agri Drone",
    url: "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/source-10-liter-dual-agri-drone-49e7f0e4ebb1.webp"
  },
  {
    slug: "source-10-liter-dual-agri-drone-with-spreader",
    name: "10 Liter Dual Agri drone with Spreader",
    url: "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/source-10-liter-dual-agri-drone-with-spreader-49e7f0e4ebb1.webp"
  },
  {
    slug: "source-10-liters-agri-drone-3-in-1",
    name: "10 Liters Agri Drone 3 in 1",
    url: "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/10-liters-agri-drone-3-in-1-3c16cd93f0d5.webp"
  },
  {
    slug: "source-10-liters-agri-drone-3-in-1-ver-2",
    name: "10 Liters Agri Drone 3 in 1 Ver 2",
    url: "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/10-liters-agri-drone-3-in-1-ver-2-02f8519a2e56.webp"
  },
  {
    slug: "source-10-liters-agri-drone-4-in-1",
    name: "10 Liters Agri Drone 4 in 1",
    url: "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/10-liters-agri-drone-4-in-1-a05fbaa2830f.webp"
  },
  {
    slug: "source-10-liters-agri-drone-with-safety-sensors",
    name: "10 Liters Agri Drone with safety sensors",
    url: "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/source-10-liters-agri-drone-with-safety-sensors-22cc2c0f6ef8.webp"
  },
  {
    slug: "source-10-liters-tc-licensed-agri-drone",
    name: "10 Liters TC Licensed Agri Drone",
    url: "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/source-10-liters-tc-licensed-agri-drone-7b15598f6ffc.webp"
  },
  {
    slug: "source-10-05-02-0095-eft-10l-tank-10l-standard-for-agricultural-drone-parts-e410p-e610p",
    name: "EFT 10L Tank (E410P/E610P)",
    url: "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/source-10-05-02-0095-eft-10l-tank-10l-standard-for-agricultural-drone-parts-e410p-e610p-9713d2b3647c.webp"
  },
  {
    slug: "source-10l-agri-drone-best-price",
    name: "10L Agri Drone Best Price",
    url: "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/10l-agri-drone-best-price-94eadbf1cd6a.webp"
  },
  {
    slug: "source-10l-agri-drone-with-basic-features",
    name: "10L Agri Drone with Basic features",
    url: "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/source-10l-agri-drone-with-basic-features-c68a481ced14.webp"
  }
];

const SKIP = new Set(["source-2408-sets-of-propeller-with-adaptor"]);

function hashBuffer(buffer, size = 12) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, size);
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Real-HQ clarity — same product, no extras, no structure change.
 * Uses Sharp pipeline with alpha preserved (no raw channel remix).
 * Light white-fringe cleanup on soft edges. Same WxH. WebP <= original.
 */
async function enhanceClarity(sourceBuffer) {
  const meta = await sharp(sourceBuffer, { failOn: "none" }).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  // Photographic clarity while keeping alpha channel intact
  let pipeline = sharp(sourceBuffer, { failOn: "none" })
    .ensureAlpha()
    .resize(width, height, { fit: "fill" })
    .modulate({ brightness: 1.01, saturation: 1.03 })
    .sharpen({ sigma: 0.85, m1: 0.7, m2: 0.35 });

  const enhancedPng = await pipeline.png().toBuffer();

  // Defringe white borderline only — do not alter opaque product body
  const { data, info } = await sharp(enhancedPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const out = Buffer.from(data);
  for (let i = 0; i < info.width * info.height; i++) {
    const o = i * ch;
    const a = out[o + 3];
    const r = out[o];
    const g = out[o + 1];
    const b = out[o + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (a > 0 && a < 200 && luma > 230) {
      out[o + 3] = Math.round(a * 0.3);
    } else if (a > 0 && a < 160 && luma > 215) {
      out[o + 3] = Math.round(a * 0.55);
    }
  }

  const rgba = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: ch }
  })
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();

  const originalBytes = sourceBuffer.byteLength;
  let best = null;
  for (const q of [92, 90, 88, 86, 84, 82, 80, 78, 75, 72, 68, 60, 50, 40]) {
    const webp = await sharp(rgba).webp({ quality: q, effort: 6, alphaQuality: 100 }).toBuffer();
    if (!best || webp.byteLength < best.byteLength) best = { buffer: webp, quality: q };
    if (webp.byteLength <= originalBytes) {
      return { buffer: webp, quality: q, width, height, originalBytes, outBytes: webp.byteLength };
    }
  }

  // Last resort: keep original if enhance cannot fit size (never ship oversized)
  return {
    buffer: sourceBuffer,
    quality: null,
    width,
    height,
    originalBytes,
    outBytes: originalBytes,
    sizeWarning: true,
    keptOriginal: true
  };
}

async function processOne(product) {
  if (SKIP.has(product.slug)) {
    return { slug: product.slug, name: product.name, status: "skipped_already_enhanced" };
  }

  const dir = join(outRoot, product.slug);
  mkdirSync(dir, { recursive: true });

  const before = await download(product.url);
  writeFileSync(join(dir, "before.webp"), before);

  const result = await enhanceClarity(before);
  writeFileSync(join(dir, "after.webp"), result.buffer);

  const previewPng = await sharp(result.buffer)
    .flatten({ background: { r: 245, g: 245, b: 245 } })
    .png()
    .toBuffer();
  writeFileSync(join(dir, "after-preview.png"), previewPng);

  const beforePreview = await sharp(before)
    .flatten({ background: { r: 245, g: 245, b: 245 } })
    .png()
    .toBuffer();
  writeFileSync(join(dir, "before-preview.png"), beforePreview);

  const entry = {
    slug: product.slug,
    name: product.name,
    oldUrl: product.url,
    status: "ready_for_approval",
    width: result.width,
    height: result.height,
    originalBytes: result.originalBytes,
    outBytes: result.outBytes,
    quality: result.quality,
    sizeOk: result.outBytes <= result.originalBytes,
    contentHash: hashBuffer(result.buffer),
    afterPath: join(dir, "after.webp"),
    beforePath: join(dir, "before.webp"),
    previewPath: join(dir, "after-preview.png"),
    beforePreviewPath: join(dir, "before-preview.png")
  };
  console.log(
    `OK ${product.name} | ${result.width}x${result.height} | ${result.originalBytes} -> ${result.outBytes} q${result.quality}`
  );
  return entry;
}

async function main() {
  mkdirSync(outRoot, { recursive: true });

  // Parallel batch
  const report = await Promise.all(PRODUCTS.map((product) => processOne(product)));

  writeFileSync(join(outRoot, "report.json"), JSON.stringify(report, null, 2));
  const ready = report.filter((r) => r.status === "ready_for_approval");
  console.log(
    JSON.stringify(
      {
        batch: "cutout-batch-01",
        count: ready.length,
        outRoot,
        firstForApproval: ready[0]
          ? { name: ready[0].name, slug: ready[0].slug, previewPath: ready[0].previewPath }
          : null
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
