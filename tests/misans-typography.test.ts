import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const VF_FILES = [
  "b8005e4731c12f9b1655028b1e379a35.woff2",
  "f68542001156732bb26af687f85956e2.woff2",
  "614daf4b8de596ecf6cd12b32a6ee4b0.woff2",
  "fc40589ea1fc8678fc5c08c26af31ac9.woff2",
] as const;

describe("MiSans VF typography", () => {
  it("loads MiSans VF with Insta360-exact type scale and no faux weights", () => {
    const globals = source("app/globals.css");
    const density = source("app/storefront-density.css");
    const shelves = source("sections/home/home-shelf-shared.module.css");
    const layout = source("app/layout.tsx");
    const faces = source("lib/fonts/misans-faces.css");
    const loader = source("lib/fonts/misans.ts");

    expect(existsSync(join(process.cwd(), "lib/fonts/misans.ts"))).toBe(true);
    expect(existsSync(join(process.cwd(), "lib/fonts/misans-faces.css"))).toBe(true);
    expect(existsSync(join(process.cwd(), "lib/fonts/misans-vf.ts"))).toBe(false);
    expect(loader).toContain("./misans-faces.css");
    expect(layout).toContain("@/lib/fonts/misans");
    expect(layout).toContain("fonts-pending");
    expect(layout).toContain("document.fonts.load");

    expect(globals).toContain('--font-misans: "MiSans VF"');
    expect(globals).toContain('font-family: "MiSans VF"');
    expect(globals).toContain("font-synthesis: none");
    expect(globals).toContain("--type-brand-header-weight: 700");
    expect(globals).toContain("--type-featured-title-weight: 700");
    expect(globals).toContain("--type-product-title-weight: 600");
    expect(globals).toContain("--type-tagline-weight: 400");
    expect(globals).toContain("--tracking-tighter: -0.02em");
    expect(globals).toContain("--tracking-display: -0.02em");
    expect(globals).toContain("--leading-hero: 1.05");
    expect(globals).toContain("--leading-body: 1.5");
    expect(globals).not.toContain("font-weight: 650");
    expect(globals).not.toContain("font-weight: 420");
    expect(globals).not.toContain("letter-spacing: -0.045em");

    expect(density).toContain("--hero-panel-title-size: var(--type-brand-header)");
    expect(density).not.toContain("1.45rem * var(--storefront-type-scale)");

    expect(shelves).toContain("--type-featured-title-weight");
    expect(shelves).toContain("font-weight: 400");
    expect(shelves).not.toContain("font-weight: 420");
    expect(shelves).toContain("var(--type-section)");
    expect(shelves).toContain("var(--type-product-title)");

    expect(faces).toContain('font-family: "MiSans VF"');
    expect(faces).toContain("font-weight: 100 900");
    expect(faces).toContain("font-display: block");
    expect(faces).not.toMatch(/src:\s*local\(/);
    expect(faces).not.toContain("MiSansLatin-");
    expect(faces).not.toContain("font-display: swap");

    for (const file of VF_FILES) {
      expect(faces).toContain(`/fonts/${file}`);
      expect(existsSync(join(process.cwd(), "public/fonts", file))).toBe(true);
    }

    expect(existsSync(join(process.cwd(), "node_modules/misans"))).toBe(false);
  });
});
