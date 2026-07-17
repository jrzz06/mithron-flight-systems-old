import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = process.argv[2];
if (!source) {
  console.error("Usage: node tools/process-mithron-wordmark.mjs <source-image>");
  process.exit(1);
}

const outputDir = join(root, "public", "media", "mithron", "shell");
mkdirSync(outputDir, { recursive: true });
const pngPath = join(outputDir, "mithron-wordmark.png");

const BRAND_GREEN = { r: 34, g: 210, b: 28 };

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function buildAlphaMask({ data, info }) {
  const { channels } = info;
  const alpha = new Uint8Array(data.length / channels);

  for (let i = 0, pixel = 0; i < data.length; i += channels, pixel += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const greenness = g - Math.max(r, b);
    const minChannel = Math.min(r, g, b);

    if (minChannel >= 246) {
      alpha[pixel] = 0;
      continue;
    }

    if (greenness >= 20) {
      alpha[pixel] = 255;
      continue;
    }

    if (minChannel >= 210) {
      alpha[pixel] = clamp(Math.round(255 * (1 - (minChannel - 210) / 36) * Math.max(greenness / 16, 0.05)));
      continue;
    }

    alpha[pixel] = greenness >= 8 ? 255 : clamp(Math.round((greenness / 8) * 180));
  }

  return alpha;
}

function erodeAlpha(alpha, width, height, radius = 1) {
  const eroded = new Uint8Array(alpha.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let minAlpha = 255;

      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          minAlpha = Math.min(minAlpha, alpha[ny * width + nx]);
        }
      }

      eroded[y * width + x] = minAlpha;
    }
  }

  return eroded;
}

function paintSolidGreen({ data, info, alpha }) {
  const { channels } = info;

  for (let i = 0, pixel = 0; i < data.length; i += channels, pixel += 1) {
    const value = alpha[pixel];
    data[i] = BRAND_GREEN.r;
    data[i + 1] = BRAND_GREEN.g;
    data[i + 2] = BRAND_GREEN.b;
    data[i + 3] = value;
  }

  return data;
}

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const alpha = erodeAlpha(buildAlphaMask({ data, info }), info.width, info.height, 1);
paintSolidGreen({ data, info, alpha });

const output = await sharp(data, {
  raw: {
    width: info.width,
    height: info.height,
    channels: info.channels
  }
})
  .trim({ threshold: 1 })
  .png()
  .toBuffer();

await sharp(output).png().toFile(pngPath);

const meta = await sharp(output).metadata();
console.log(`Saved ${pngPath} (${meta.width}x${meta.height})`);
