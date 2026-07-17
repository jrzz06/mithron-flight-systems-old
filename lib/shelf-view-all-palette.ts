import type { CSSProperties } from "react";
import {
  resolveShelfViewAllPalette,
  type ShelfHeroPalette,
  type ShelfTone
} from "@/config/shelf-view-all-palettes";

function parseHex(hex: string) {
  const normalized = hex.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

export function hexToRgba(hex: string, alpha: number) {
  const rgb = parseHex(hex);
  if (!rgb) {
    return `rgba(68, 76, 247, ${alpha})`;
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function paletteFadeVars(palette: ShelfHeroPalette, hover = false) {
  const accentBoost = hover ? 0.04 : 0;
  const secondaryBoost = hover ? 0.03 : 0;

  return {
    "--shelf-view-all-fade-bottom": hexToRgba(palette.accent, 0.14 + accentBoost),
    "--shelf-view-all-fade-mid": hexToRgba(palette.accent, 0.06 + accentBoost * 0.5),
    "--shelf-view-all-fade-bloom": hexToRgba(palette.accentSecondary, 0.12 + secondaryBoost),
    "--shelf-view-all-fade-bloom-pos": "50% 100%",
    "--shelf-view-all-fade-bottom-hover": hexToRgba(palette.accent, 0.18),
    "--shelf-view-all-fade-mid-hover": hexToRgba(palette.accent, 0.09),
    "--shelf-view-all-fade-bloom-hover": hexToRgba(palette.accentSecondary, 0.16)
  };
}

export function shelfViewAllPaletteStyle(palette: ShelfHeroPalette): CSSProperties {
  return {
    "--shelf-view-all-base": palette.surface,
    "--shelf-view-all-dot": palette.pattern,
    "--shelf-view-all-accent-soft-06": hexToRgba(palette.accent, 0.06),
    "--shelf-view-all-accent-soft-08": hexToRgba(palette.accent, 0.08),
    "--shelf-view-all-accent-soft-18": hexToRgba(palette.accent, 0.18),
    "--shelf-view-all-accent-soft-22": hexToRgba(palette.accent, 0.22),
    "--shelf-view-all-accent-vignette": hexToRgba(palette.accent, 0.08),
    "--shelf-view-all-bloom-mid": hexToRgba(palette.surface, 0.12),
    "--shelf-view-all-image-shadow": hexToRgba(palette.accentSecondary, 0.12),
    ...paletteFadeVars(palette)
  } as CSSProperties;
}

export function resolveShelfViewAllPaletteStyle(tone: ShelfTone, heroSrc?: string) {
  return shelfViewAllPaletteStyle(resolveShelfViewAllPalette(tone, heroSrc));
}
