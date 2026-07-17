import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

export type CutoutMetrics = {
  coverage?: number;
  haloRatio?: number;
  cornerAlphaMax?: number;
  semiTransparentPixels?: number;
  bbox?: number[];
  margins?: Record<string, number>;
};

export type AutoCutoutResult = {
  buffer: Buffer;
  mimeType: string;
  wasProcessed: boolean;
  skipped?: boolean;
  skipReason?: string;
  metrics?: CutoutMetrics;
};

const MIN_TRUSTED_ALPHA_COVERAGE = 0.05;
const MAX_TRUSTED_ALPHA_COVERAGE = 0.62;
const STAGE_SIZE = 1024;

async function measureAlphaCoverage(buffer: Buffer): Promise<{ hasAlpha: boolean; coverage: number }> {
  const image = sharp(buffer, { failOn: "none" });
  const metadata = await image.metadata();
  if (!metadata.hasAlpha || !metadata.width || !metadata.height) {
    return { hasAlpha: false, coverage: 0 };
  }

  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const total = info.width * info.height;
  let opaquePixels = 0;

  for (let index = 0; index < data.length; index += channels) {
    if (data[index + 3] > 8) opaquePixels += 1;
  }

  return {
    hasAlpha: true,
    coverage: total > 0 ? opaquePixels / total : 0
  };
}

function isTrustedCutout(hasAlpha: boolean, coverage: number) {
  return hasAlpha && coverage >= MIN_TRUSTED_ALPHA_COVERAGE && coverage <= MAX_TRUSTED_ALPHA_COVERAGE;
}

function cleanupWorkDir(workDir: string) {
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    // Best-effort temp cleanup.
  }
}

export async function autoCutoutIfNeeded(
  imageBuffer: Buffer,
  mimeType: string
): Promise<AutoCutoutResult> {
  if (!mimeType.startsWith("image/")) {
    return {
      buffer: imageBuffer,
      mimeType,
      wasProcessed: false,
      skipped: true,
      skipReason: "not_an_image"
    };
  }

  const { hasAlpha, coverage } = await measureAlphaCoverage(imageBuffer);
  if (isTrustedCutout(hasAlpha, coverage)) {
    return {
      buffer: imageBuffer,
      mimeType,
      wasProcessed: false,
      metrics: { coverage }
    };
  }

  const root = process.cwd();
  const workDir = join(tmpdir(), `mithron-cutout-${randomUUID()}`);
  mkdirSync(workDir, { recursive: true });

  const inputPath = join(workDir, "input.png");
  const outputPath = join(workDir, "output.png");
  const batchPath = join(workDir, "batch.json");
  const resultsPath = join(workDir, "results.json");

  try {
    await sharp(imageBuffer, { failOn: "none" })
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: false })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(inputPath);

    writeFileSync(
      batchPath,
      JSON.stringify({
        items: [{
          slug: "upload",
          inputPath,
          outputPath,
          studioOutputPath: null,
          tightCrop: false
        }]
      })
    );

    const result = spawnSync(
      "python",
      [
        join(root, "tools", "catalog-product-cutout-batch.py"),
        "--batch",
        batchPath,
        "--out",
        resultsPath
      ],
      {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024
      }
    );

    if (result.status !== 0) {
      return {
        buffer: imageBuffer,
        mimeType,
        wasProcessed: false,
        skipped: true,
        skipReason: result.stderr?.trim() || result.stdout?.trim() || "cutout_process_failed"
      };
    }

    const parsed = JSON.parse(readFileSync(resultsPath, "utf8")) as {
      results?: Array<{
        status?: string;
        reason?: string;
        stageMetrics?: CutoutMetrics;
        rawMetrics?: CutoutMetrics;
      }>;
    };
    const cutout = parsed.results?.[0];
    if (!cutout || cutout.status !== "accepted") {
      return {
        buffer: imageBuffer,
        mimeType,
        wasProcessed: false,
        skipped: true,
        skipReason: cutout?.reason ?? "cutout_rejected"
      };
    }

    const webpBuffer = await sharp(readFileSync(outputPath))
      .resize({
        width: STAGE_SIZE,
        height: STAGE_SIZE,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality: 92, effort: 6, smartSubsample: true })
      .toBuffer();

    const webpMetadata = await sharp(webpBuffer).metadata();
    if (!webpMetadata.hasAlpha) {
      return {
        buffer: imageBuffer,
        mimeType,
        wasProcessed: false,
        skipped: true,
        skipReason: "processed_webp_lost_alpha"
      };
    }

    return {
      buffer: webpBuffer,
      mimeType: "image/webp",
      wasProcessed: true,
      metrics: cutout.stageMetrics ?? cutout.rawMetrics
    };
  } catch (error) {
    return {
      buffer: imageBuffer,
      mimeType,
      wasProcessed: false,
      skipped: true,
      skipReason: error instanceof Error ? error.message : String(error)
    };
  } finally {
    cleanupWorkDir(workDir);
  }
}
