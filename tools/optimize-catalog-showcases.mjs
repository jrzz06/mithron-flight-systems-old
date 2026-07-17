import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const sourceDir = join(root, "public", "media", "mithron", "catalog");
const outputDir = join(root, "public", "optimized", "catalog-showcases");
const targetWidths = [480, 768, 1280, 1600, 1920];
const WEBP_QUALITY = 96;

const files = [
  "agri-drone-category.png",
  "video-drone-category.png",
  "creative-drone-category.png",
  "mithron-drone-category.png",
  "survey-drone-category.png",
  "surveillance-drone-category.png",
  "global-products-category.png"
];

const manifestPath = join(outputDir, "manifest.json");
const existingManifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : { assets: {} };

const manifest = {
  generatedAt: new Date().toISOString(),
  assets: { ...existingManifest.assets }
};

mkdirSync(outputDir, { recursive: true });

for (const file of files) {
  const sourcePath = join(sourceDir, file);
  if (!existsSync(sourcePath)) {
    console.warn(`skip missing ${file}`);
    continue;
  }

  const slug = file.replace(/\.[a-z0-9]+$/i, "");
  const assetDir = join(outputDir, slug);
  mkdirSync(assetDir, { recursive: true });

  const meta = await sharp(sourcePath).metadata();
  const sourceBytes = statSync(sourcePath).size;
  const variants = {
    webp: []
  };

  for (const width of targetWidths) {
    const buffer = await sharp(sourcePath)
      .resize({ width, withoutEnlargement: true, fit: "inside" })
      .webp({ quality: WEBP_QUALITY, effort: 6, smartSubsample: true })
      .toBuffer();

    const outputName = `${width}.webp`;
    const outputPath = join(assetDir, outputName);
    writeFileSync(outputPath, buffer);

    const info = await sharp(buffer).metadata();
    variants.webp.push({
      width: info.width ?? Math.min(width, meta.width ?? width),
      height: info.height ?? Math.round(Math.min(width, meta.width ?? width) * ((meta.height ?? 9) / (meta.width ?? 16))),
      src: `/optimized/catalog-showcases/${slug}/${outputName}`,
      bytes: buffer.byteLength,
      sizeKb: Number((buffer.byteLength / 1024).toFixed(2))
    });
    console.log(`wrote ${slug}/${outputName}`);
  }

  manifest.assets[slug] = {
    fallbackSrc: `/media/mithron/catalog/${file}`,
    width: meta.width,
    height: meta.height,
    sourceBytes,
    formats: variants,
    variants: variants.webp.map(({ width, height, src }) => ({ width, height, src }))
  };
}

writeFileSync(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log("catalog showcase optimization complete");
