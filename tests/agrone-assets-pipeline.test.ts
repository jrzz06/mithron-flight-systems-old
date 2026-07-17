import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const sourceDir = join(projectRoot, "public", "media", "mithron", "mission", "agrone");
const manifestPath = join(projectRoot, "public", "optimized", "agrone-mission", "manifest.json");

const expectedSources = [
  "agrone-drone-owner-registration.png",
  "agrone-pilot-registration.png",
  "all-india-drone-farmer.png",
  "smart-farmer-register.png",
  "agri-drone-loan.png"
];

describe("agrone asset pipeline", () => {
  it("installs and optimizes agrone mission images when sources are missing", () => {
    const missingSource = expectedSources.some((file) => !existsSync(join(sourceDir, file)));
    const missingManifest = !existsSync(manifestPath);

    if (missingSource) {
      execSync("node tools/install-agrone-source-images.mjs", { cwd: projectRoot, stdio: "inherit" });
    }

    if (missingSource || missingManifest) {
      execSync("node tools/optimize-agrone-mission-images.mjs", { cwd: projectRoot, stdio: "inherit" });
    }

    for (const file of expectedSources) {
      expect(existsSync(join(sourceDir, file))).toBe(true);
    }

    expect(existsSync(manifestPath)).toBe(true);
  });
});
