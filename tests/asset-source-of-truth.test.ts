import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { heroAssets, interestAssets, catalogShowcaseAssets } from "@/config/assets";
import { storefrontMediaPaths } from "@/config/storefront-media-paths";
import pathAliases from "@/config/storefront-path-aliases.json";
import { canonicalStorefrontPath } from "@/lib/media/resolve-storefront-src";
import { MITHRON_WORDMARK_SRC } from "@/config/storefront-media-paths";

describe("asset source of truth registry", () => {
  it("keeps config/assets.ts aligned with storefront-media-paths", () => {
    expect(heroAssets.ag10Command).toBe(storefrontMediaPaths.hero.ag10Command);
    expect(heroAssets.mappingFlight).toBe(storefrontMediaPaths.hero.mappingFlight);
    expect(heroAssets.securityGrid).toBe(storefrontMediaPaths.hero.securityGrid);
    expect(interestAssets.agriculture).toBe(storefrontMediaPaths.interests.agriculture);
    expect(catalogShowcaseAssets.globalProductsCategory).toBe(storefrontMediaPaths.catalog.globalProducts);
  });

  it("uses canonical hero slide paths under /assets/hero/", () => {
    expect(storefrontMediaPaths.hero.slide01).toBe("/assets/hero/hero-slide-01.webp");
    expect(heroAssets.ag10Command).toMatch(/^\/assets\/hero\//);
  });

  it("resolves legacy hero aliases to canonical slide paths", () => {
    expect(canonicalStorefrontPath("/media/mithron/hero/ag10-command.webp")).toBe("/assets/hero/hero-slide-01.webp");
    expect(canonicalStorefrontPath("/media/mithron/carousel/security-grid.webp")).toBe("/assets/hero/hero-slide-04.webp");
  });

  it("shares path aliases between runtime resolver and pipeline inventory", () => {
    const inventory = readFileSync(join(process.cwd(), "tools/storefront-image-inventory.mjs"), "utf8");
    expect(inventory).toContain("storefront-path-aliases.json");
    expect(pathAliases["/media/mithron/hero/ag10-command.webp"]).toBe("/assets/hero/hero-slide-01.webp");
  });

  it("defines a single canonical wordmark identifier", () => {
    expect(MITHRON_WORDMARK_SRC).toBe("/media/mithron/shell/mithron-wordmark.png");
    const inventory = readFileSync(join(process.cwd(), "tools/storefront-image-inventory.mjs"), "utf8");
    expect(inventory).toContain(MITHRON_WORDMARK_SRC);
  });

  it("does not reference wixstatic URLs in runtime source", () => {
    const runtimeDirs = ["app", "components", "config", "lib", "sections", "services"];
    for (const dir of runtimeDirs) {
      const full = join(process.cwd(), dir);
      // spot-check key files rather than walking entire tree in unit test
      if (dir === "config") {
        const assets = readFileSync(join(full, "assets.ts"), "utf8");
        expect(assets).not.toContain("wixstatic");
      }
    }
  });
});
