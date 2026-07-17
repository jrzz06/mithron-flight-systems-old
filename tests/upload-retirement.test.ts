import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isUploadApiRetired } from "@/lib/media/canonical-batch-upload";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("upload api retirement", () => {
  it("routes canonical batch uploads through media_assets only", () => {
    const uploadRoute = source("app/api/upload/route.ts");
    const canonicalUpload = source("lib/media/canonical-batch-upload.ts");
    expect(uploadRoute).toContain("runCanonicalBatchUpload");
    expect(uploadRoute).toContain("X-Mithron-Upload-Deprecated");
    expect(canonicalUpload).toContain('canonicalTarget: "media_assets"');
    expect(canonicalUpload).toContain("skipManifestWrite: true");
  });

  it("returns 410 when upload api retirement flag is enabled", () => {
    const previous = process.env.MITHRON_UPLOAD_API_RETIRED;
    process.env.MITHRON_UPLOAD_API_RETIRED = "true";
    expect(isUploadApiRetired()).toBe(true);
    const uploadRoute = source("app/api/upload/route.ts");
    expect(uploadRoute).toContain("UPLOAD_API_RETIRED");
    expect(uploadRoute).toContain("410");
    if (previous === undefined) {
      delete process.env.MITHRON_UPLOAD_API_RETIRED;
    } else {
      process.env.MITHRON_UPLOAD_API_RETIRED = previous;
    }
  });

  it("ships editorial manifest regeneration tooling", () => {
    expect(source("tools/regenerate-editorial-manifest.mjs")).toContain("media_assets");
  });
});
