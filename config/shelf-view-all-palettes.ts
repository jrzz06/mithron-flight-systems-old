import { storefrontMediaPaths } from "@/config/storefront-media-paths";

export type ShelfTone = "world" | "care" | "global";

/** Three hero-sampled colors per shelf banner, plus derived card surface. */
export type ShelfHeroPalette = {
  surface: string;
  pattern: string;
  accent: string;
  accentSecondary: string;
};

/**
 * Colors sampled from each product-shelf hero banner (drone_world, drone_care, global_products).
 * surface/pattern: light tints for card base; accent/accentSecondary: pattern + bloom hues.
 */
export const SHELF_VIEW_ALL_PALETTES: Record<ShelfTone, ShelfHeroPalette> = {
  world: {
    surface: "#E6EBE8",
    pattern: "#E6EBE8",
    accent: "#2D4A3E",
    accentSecondary: "#8B7355"
  },
  care: {
    surface: "#EDE9E3",
    pattern: "#EDE9E3",
    accent: "#6B7F72",
    accentSecondary: "#C4B5A0"
  },
  global: {
    surface: "#E3ECF7",
    pattern: "#E3ECF7",
    accent: "#1E3A5F",
    accentSecondary: "#3B82F6"
  }
};

const SHELF_HERO_SRC_TO_TONE: Record<string, ShelfTone> = {
  [storefrontMediaPaths.showcase.droneWorld]: "world",
  [storefrontMediaPaths.showcase.droneCare]: "care",
  [storefrontMediaPaths.showcase.globalProducts]: "global"
};

export function shelfToneForHeroSrc(heroSrc?: string): ShelfTone | null {
  if (!heroSrc) return null;
  const normalized = heroSrc.split("?")[0] ?? heroSrc;
  return SHELF_HERO_SRC_TO_TONE[normalized] ?? null;
}

export function resolveShelfViewAllPalette(tone: ShelfTone, heroSrc?: string): ShelfHeroPalette {
  const toneFromHero = shelfToneForHeroSrc(heroSrc);
  const resolvedTone = toneFromHero ?? tone;
  return SHELF_VIEW_ALL_PALETTES[resolvedTone];
}
