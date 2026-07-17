import { describe, expect, it } from "vitest";
import { storefrontMediaPaths } from "@/config/storefront-media-paths";
import { SHELF_VIEW_ALL_PALETTES } from "@/config/shelf-view-all-palettes";
import {
  hexToRgba,
  resolveShelfViewAllPaletteStyle,
  shelfViewAllPaletteStyle
} from "@/lib/shelf-view-all-palette";

describe("shelf view-all palette", () => {
  it("assigns distinct hero-sampled palettes per shelf tone", () => {
    expect(SHELF_VIEW_ALL_PALETTES.world.surface).toBe("#E6EBE8");
    expect(SHELF_VIEW_ALL_PALETTES.care.surface).toBe("#EDE9E3");
    expect(SHELF_VIEW_ALL_PALETTES.global.surface).toBe("#E3ECF7");
    expect(SHELF_VIEW_ALL_PALETTES.world.accent).not.toBe(SHELF_VIEW_ALL_PALETTES.global.accent);
  });

  it("maps shelf hero src to the matching palette vars", () => {
    const worldStyle = resolveShelfViewAllPaletteStyle("care", storefrontMediaPaths.showcase.droneWorld) as Record<string, string>;
    expect(worldStyle["--shelf-view-all-base"]).toBe("#E6EBE8");
    expect(worldStyle["--shelf-view-all-dot"]).toBe("#E6EBE8");
    expect(worldStyle["--shelf-view-all-accent-soft-18"]).toBe(hexToRgba("#2D4A3E", 0.18));
  });

  it("falls back to tone when hero src is unknown", () => {
    const globalStyle = resolveShelfViewAllPaletteStyle("global", "/media/custom/hero.png") as Record<string, string>;
    expect(globalStyle["--shelf-view-all-base"]).toBe("#E3ECF7");
    expect(globalStyle["--shelf-view-all-fade-bloom"]).toBe(hexToRgba("#3B82F6", 0.12));
  });

  it("exports CSS custom properties for the view-all card pattern", () => {
    const style = shelfViewAllPaletteStyle(SHELF_VIEW_ALL_PALETTES.care) as Record<string, string>;
    expect(style["--shelf-view-all-base"]).toBe("#EDE9E3");
    expect(style["--shelf-view-all-image-shadow"]).toBe(hexToRgba("#C4B5A0", 0.12));
    expect(style["--shelf-view-all-fade-bottom-hover"]).toBe(hexToRgba("#6B7F72", 0.18));
  });
});
