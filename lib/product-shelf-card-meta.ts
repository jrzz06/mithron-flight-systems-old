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

export function compactProductMeta(product: Pick<ProductShelfCardItem, "tagline">) {
  const phrase = product.tagline
    .replace(/\s+/g, " ")
    .split(/[.;\n]/)[0]
    ?.split(",")
    .slice(0, 2)
    .join(",")
    .trim();
  const detail = phrase && phrase.length > 42 ? `${phrase.slice(0, 39).trim()}...` : phrase;
  return { detail };
}

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

      if (/^[A-Z0-9]{2,}$/.test(token) && token === token.toUpperCase()) {
        return token;
      }

      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(" ");
}
