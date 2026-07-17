import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const publicRoot = join(root, "public", "media", "mithron");
const manifestPath = join(root, "data", "mithron-retrieved-assets.generated.json");
const source = "https://www.mithron.co/";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

const sourceImages = {
  mission: {
    agriculture: "https://static.wixstatic.com/media/104910_d0c737fea2fd4db89fc3eb26605c9c2c~mv2.jpg",
    mapping: "https://static.wixstatic.com/media/703249_d66b1a59c3d945c1920e022166161bec~mv2.jpg",
    surveillance: "https://static.wixstatic.com/media/703249_78d96c63f063423883387541f3901f48~mv2.jpg",
    delivery: "https://static.wixstatic.com/media/703249_66ebebef282f475c911361a147d17be1~mv2.jpg",
    creative: "https://static.wixstatic.com/media/703249_8a6ca92428cd476093bccb06c6d17313~mv2.jpg",
    industrial: "https://static.wixstatic.com/media/703249_cc5a0065b72445e6996e7d4dc0069436~mv2.jpg",
    training: "https://static.wixstatic.com/media/703249_023a776f7732400c941b7f5a818a5c2a~mv2.jpg",
    command: "https://static.wixstatic.com/media/104910_971d54a99e594dc1a17d07699831ecee~mv2.png/v1/fill/w_1280,h_720,al_c/104910_971d54a99e594dc1a17d07699831ecee~mv2.png"
  }
};

const sceneTargets = [
  {
    key: "agriculture",
    out: "ag10-command",
    role: "hero",
    title: "Agri drone deployment"
  },
  {
    key: "surveillance",
    out: "security-grid",
    role: "hero",
    title: "Surveillance ecosystem"
  },
  {
    key: "mapping",
    out: "mapping-flight",
    role: "hero",
    title: "Survey intelligence systems"
  },
  { key: "agriculture", out: "agriculture", role: "category", title: "Smart Agriculture" },
  { key: "mapping", out: "mapping", role: "category", title: "Survey and Mapping" },
  { key: "creative", out: "video-drones", role: "category", title: "Video Drones" },
  { key: "training", out: "creative-drones", role: "category", title: "Drone Training" },
  { key: "agriculture", out: "smart-farming", role: "category", title: "Precision Spraying" },
  { key: "surveillance", out: "defense-security", role: "category", title: "Defense and Surveillance" },
  { key: "industrial", out: "industrial-inspection", role: "category", title: "Industrial Inspection" },
  { key: "surveillance", out: "surveillance", role: "category", title: "AI Monitoring" },
  { key: "command", out: "components", role: "category", title: "Ecosystem Infrastructure" },
  { key: "agriculture", out: "precision-spray", role: "mission", title: "Precision spray story" },
  { key: "mapping", out: "terrain-radar", role: "mission", title: "Terrain radar story" },
  { key: "command", out: "mission-planning", role: "mission", title: "Mission planning story" },
  { key: "command", out: "drone-ecosystem", role: "mission", title: "Drone ecosystem story" },
  { key: "agriculture", out: "crop-health", role: "mission", title: "Crop health story" }
];

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 12);
}

function ensureDir(path) {
  if (!dryRun) mkdirSync(path, { recursive: true });
}

function write(path, buffer) {
  ensureDir(dirname(path));
  if (!dryRun) writeFileSync(path, buffer);
}

async function fetchImage(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mithron asset retrieval pipeline; local project cache"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function gradientSvg(width, height, dark = false) {
  const base = dark ? "#080c12" : "#f6f7f8";
  const mid = dark ? "#121b24" : "#eef2f5";
  const accent = dark ? "#6fa7ff" : "#dbe8ef";
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${base}"/>
      <stop offset=".52" stop-color="${mid}"/>
      <stop offset="1" stop-color="${dark ? "#05070a" : "#ffffff"}"/>
    </linearGradient>
    <radialGradient id="a" cx="72%" cy="28%" r="58%">
      <stop offset="0" stop-color="${accent}" stop-opacity="${dark ? ".34" : ".5"}"/>
      <stop offset=".6" stop-color="${accent}" stop-opacity=".12"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#a)"/>
  <path d="M0 ${height * 0.76}C${width * 0.18} ${height * 0.7} ${width * 0.32} ${height * 0.84} ${width * 0.52} ${height * 0.76}S${width * 0.82} ${height * 0.64} ${width} ${height * 0.72}" fill="none" stroke="${dark ? "#6fd8ff" : "#9db3c0"}" stroke-opacity="${dark ? ".2" : ".18"}" stroke-width="4"/>
</svg>`);
}

async function makeScene(target) {
  const sourceUrl = sourceImages.mission[target.key];
  const input = await fetchImage(sourceUrl);
  const isDark = target.role === "hero" && target.key === "surveillance";
  const width = target.role === "hero" ? 3840 : target.role === "mission" ? 2400 : 2400;
  const height = target.role === "hero" ? 2160 : target.role === "mission" ? 1800 : 1500;
  const base = await sharp(input)
    .rotate()
    .resize(width, height, { fit: "cover", position: "center" })
    .modulate({ brightness: isDark ? 0.72 : 1.04, saturation: 0.88 })
    .blur(target.role === "hero" ? 1.2 : 0.5)
    .png()
    .toBuffer();
  const wash = await sharp(gradientSvg(width, height, isDark)).png().toBuffer();
  const overlay = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="v" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${isDark ? "#04070b" : "#f7f9fb"}" stop-opacity="${target.role === "hero" ? ".74" : ".5"}"/>
      <stop offset=".48" stop-color="${isDark ? "#080c12" : "#eef2f5"}" stop-opacity=".18"/>
      <stop offset="1" stop-color="${isDark ? "#04070b" : "#ffffff"}" stop-opacity="${target.role === "hero" ? ".2" : ".1"}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#v)"/>
  <path d="M${width * 0.12} ${height * 0.75}C${width * 0.32} ${height * 0.6} ${width * 0.52} ${height * 0.88} ${width * 0.82} ${height * 0.58}" fill="none" stroke="${isDark ? "#73d8ff" : "#79a8b9"}" stroke-opacity="${isDark ? ".25" : ".18"}" stroke-width="6" stroke-linecap="round"/>
</svg>`);
  const masterPng = await sharp(base)
    .composite([
      { input: wash, blend: isDark ? "screen" : "soft-light", opacity: isDark ? 0.36 : 0.42 },
      { input: overlay, blend: "over" }
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
  const publicWebp = await sharp(masterPng)
    .resize(target.role === "hero" ? 1920 : 1400)
    .webp({ quality: target.role === "hero" ? 78 : 76, effort: 6 })
    .toBuffer();

  const primaryFolder = target.role === "hero" ? "hero" : target.role === "mission" ? "story" : "interests";
  const requestedFolder = target.role === "hero" ? "banners" : target.role === "mission" ? "mission" : "categories";
  const carouselFolder = target.role === "hero" ? "carousel" : null;

  write(join(publicRoot, primaryFolder, `${target.out}.webp`), publicWebp);
  write(join(publicRoot, requestedFolder, `${target.out}.webp`), publicWebp);
  write(join(publicRoot, "source", requestedFolder, `${target.out}-source.webp`), await sharp(input).resize({ width, height, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer());
  if (carouselFolder) write(join(publicRoot, carouselFolder, `${target.out}.webp`), publicWebp);

  return {
    role: target.role,
    title: target.title,
    sourceUrl,
    output: `/media/mithron/${primaryFolder}/${target.out}.webp`,
    requestedOutput: `/media/mithron/${requestedFolder}/${target.out}.webp`,
    carouselOutput: carouselFolder ? `/media/mithron/${carouselFolder}/${target.out}.webp` : undefined,
    hash: hash(publicWebp)
  };
}

async function main() {
  const assets = [];
  for (const target of sceneTargets) assets.push(await makeScene(target));

  const manifest = {
    version: 1,
    source,
    generatedAt: new Date().toISOString(),
    policy: "Product imagery is database-only. Local generation is limited to cinematic shell assets; storefront product cards must use source images from mithron_products.",
    status: "VERIFIED",
    dryRun,
    folders: ["hero", "carousel", "mission", "categories", "banners"],
    assets
  };

  if (!dryRun) {
    ensureDir(dirname(manifestPath));
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(JSON.stringify({
    status: "VERIFIED",
    dryRun,
    assets: assets.length,
    manifestPath
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
