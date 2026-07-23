import { clipProductPreviewText } from "@/lib/product-preview-text";

export type ProductShelfCardItem = {
  slug: string;
  name: string;
  price: number;
  tagline: string;
  category: string;
  badge?: string;
  badgeStyle?: string;
  image: {
    src: string;
    responsive?: import("@/config/types").ResponsiveMediaAsset;
  };
};

/** Short acronyms kept uppercase in product titles. */
const PRESERVE_ACRONYMS = new Set([
  "RC",
  "GPS",
  "GST",
  "HD",
  "FC",
  "FPV",
  "RGB",
  "LED",
  "USB",
  "ESC",
  "IMU",
  "RTK",
  "AI",
  "OSD",
  "PDB",
  "BEC",
  "CNC"
]);

/** Measurement units kept lowercase (may include trailing punctuation). */
const UNIT_TOKEN = /^(mm|cm|m|kg|g|l|ml|in|ft)([).,;:]?)$/i;

export function compactProductMeta(product: Pick<ProductShelfCardItem, "tagline">) {
  const phrase = product.tagline
    .replace(/\s+/g, " ")
    .split(/[.;\n]/)[0]
    ?.split(",")
    .slice(0, 2)
    .join(",")
    .trim();
  const detail = phrase ? clipProductPreviewText(phrase, 76) : phrase;
  return { detail };
}

/**
 * Title-case CMS product names while preserving model codes and short acronyms.
 * ALL-CAPS marketing names (e.g. "SKY PRO 4K VIDEOGRAPHY DRONE") become readable Title Case.
 */
export function formatShelfProductName(name: string): string {
  const tokens = name.match(/\[[^\]]+\]|\S+/g);
  if (!tokens) {
    return name;
  }

  return tokens
    .map((token) => {
      if (/^\[[^\]]+\]$/.test(token)) {
        return token;
      }

      if (/^\d+K$/i.test(token) || /^\d+KG$/i.test(token)) {
        return token.toUpperCase();
      }

      const unitMatch = token.match(UNIT_TOKEN);
      if (unitMatch) {
        return `${unitMatch[1].toLowerCase()}${unitMatch[2] ?? ""}`;
      }

      // Model / SKU tokens with digits: MK15, V9, D5X, A1B2
      if (/[0-9]/.test(token) && /^[A-Za-z0-9+./()-]+$/.test(token)) {
        return token.toUpperCase();
      }

      const upper = token.toUpperCase();
      if (PRESERVE_ACRONYMS.has(upper)) {
        return upper;
      }

      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(" ");
}
