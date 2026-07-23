import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function walkFiles(dir: string, exts: Set<string>, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkFiles(full, exts, out);
    else if (exts.has(extname(entry))) out.push(full);
  }
  return out;
}

const ALLOWED_WEIGHTS = new Set(["400", "500", "600", "700", "800"]);
const WEIGHT_RE = /font-weight:\s*(\d+)/g;
const ARBITRARY_TEXT_RE = /text-\[(10|11)px\]/;

describe("Cinematic Precision storefront typography", () => {
  it("loads Google Sans display + Google Sans Flex body stacks and removes FOIT gate", () => {
    const globals = source("app/globals.css");
    const density = source("app/storefront-density.css");
    const shelves = source("sections/home/home-shelf-shared.module.css");
    const layout = source("app/layout.tsx");
    const fonts = source("lib/fonts/storefront.ts");

    expect(existsSync(join(process.cwd(), "lib/fonts/storefront.ts"))).toBe(true);
    expect(existsSync(join(process.cwd(), "lib/fonts/misans.ts"))).toBe(false);
    expect(existsSync(join(process.cwd(), "lib/fonts/misans-faces.css"))).toBe(false);

    expect(fonts).toContain('from "next/font/local"');
    expect(fonts).toContain("googleSansFlex");
    expect(fonts).toContain("googleSans");
    expect(fonts).toContain("--font-google-sans-flex");
    expect(fonts).toContain("--font-google-sans");
    expect(fonts).toContain("@fontsource-variable/google-sans-flex");
    expect(fonts).toContain("@fontsource-variable/google-sans");
    expect(fonts).not.toContain("Inter");
    expect(fonts).not.toContain("SF Pro Display");
    expect(fonts).not.toContain("Plus_Jakarta_Sans");
    expect(fonts).not.toContain("--font-inter");
    expect(fonts).not.toContain("--font-plus-jakarta");
    expect(fonts).not.toContain('from "next/font/google"');
    expect(fonts).not.toContain("Outfit");
    expect(fonts).not.toContain("--font-outfit");
    expect(fonts).not.toContain("Instrument_Sans");
    expect(fonts).not.toContain("GeistSans");
    expect(fonts).not.toContain('from "geist/font/sans"');

    expect(layout).toContain("@/lib/fonts/storefront");
    expect(layout).toContain("googleSansFlex.variable");
    expect(layout).toContain("googleSans.variable");
    expect(layout).not.toContain("inter.variable");
    expect(layout).not.toContain("plusJakartaSans.variable");
    expect(layout).not.toContain("outfit.variable");
    expect(layout).not.toContain("fonts-pending");
    expect(layout).not.toContain("document.fonts.ready");
    expect(layout).not.toContain("fontDisplay.variable");

    expect(globals).toContain("--font-google-sans-flex");
    expect(globals).toContain("--font-google-sans");
    expect(globals).toContain("--font-google-sans-display");
    expect(globals).not.toContain("--font-inter");
    expect(globals).not.toContain("SF Pro Display");
    expect(globals).not.toContain("--font-sf-pro-display");
    expect(globals).not.toContain("--font-plus-jakarta");
    expect(globals).toContain("font-family: var(--font-display)");
    expect(globals).toContain("font-family: var(--font-body)");
    expect(globals).toContain("font-synthesis: none");
    expect(globals).toContain("--tracking-hero: -0.038em");
    expect(globals).toContain("--type-hero: clamp(2.5rem, 5vw, 3.5rem)");
    expect(globals).toContain("--type-brand-header-weight: 800");
    expect(globals).toContain("--type-product-title-weight: 700");
    expect(globals).toContain("--type-price-weight: 800");
    expect(globals).toContain("--leading-hero: 1.04");
    expect(globals).toContain("--leading-body: 1.65");
    expect(globals).toContain(".type-badge");
    expect(globals).toContain(".type-meta");
    expect(globals).not.toContain("html.fonts-pending");
    expect(globals).not.toContain("--font-instrument-sans-family");
    expect(globals).not.toContain("--font-geist-family");
    expect(globals).not.toContain("Instrument Sans");
    expect(globals).not.toContain("MiSans");
    expect(globals).not.toContain("Quicksand");

    expect(density).toContain("--hero-panel-title-size: var(--type-brand-header)");
    expect(density).not.toContain("1.45rem * var(--storefront-type-scale)");

    expect(shelves).toContain("text-transform: uppercase");
    expect(shelves).toContain("clamp(1.75rem, 2.2vw, 2.25rem)");
    expect(shelves).toContain("letter-spacing: 0.06em");
    expect(shelves).toContain("font-weight: 400");
    expect(shelves).not.toContain("font-weight: 420");
    expect(shelves).toContain("var(--type-product-title)");
    expect(shelves).toContain("var(--type-product-title-weight)");
    expect(shelves).not.toContain("MiSans");
    expect(shelves).not.toContain("--font-inter");
    expect(shelves).not.toContain('"Inter"');
  });

  it("allows only Cinematic Precision font-weights in CSS modules", () => {
    const roots = ["app", "components", "sections", "features"];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walkFiles(join(process.cwd(), root), new Set([".css"]))) {
        if (!file.endsWith(".module.css") && !file.endsWith(".css")) continue;
        const content = readFileSync(file, "utf8");
        WEIGHT_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = WEIGHT_RE.exec(content)) !== null) {
          if (!ALLOWED_WEIGHTS.has(match[1])) {
            offenders.push(`${file.replace(process.cwd() + "\\", "")}: ${match[0]}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("bans text-[10px] and text-[11px] in storefront JSX surfaces", () => {
    const roots = ["app", "components", "sections", "features"];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walkFiles(join(process.cwd(), root), new Set([".tsx", ".jsx"]))) {
        const content = readFileSync(file, "utf8");
        if (ARBITRARY_TEXT_RE.test(content)) {
          offenders.push(file.replace(process.cwd() + "\\", ""));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
