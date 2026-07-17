export const PRODUCT_BADGE_STYLES = ["default", "success", "warning", "premium", "sale"] as const;

export type ProductBadgeStyle = (typeof PRODUCT_BADGE_STYLES)[number];

export const PRODUCT_BADGE_TEXT_MAX = 24;

export const PRODUCT_BADGE_STYLE_LABELS: Record<ProductBadgeStyle, string> = {
  default: "Default",
  success: "New",
  warning: "Limited",
  premium: "Best Seller",
  sale: "Sale"
};

export const PRODUCT_BADGE_PRESETS: Array<{ label: string; text: string; style: ProductBadgeStyle }> = [
  { label: "New", text: "New", style: "success" },
  { label: "Sale", text: "Sale", style: "sale" },
  { label: "Best Seller", text: "Best Seller", style: "premium" }
];

export type ProductBadgeRow = {
  badge_enabled?: boolean | null;
  badge_text?: string | null;
  badge_style?: string | null;
  badge?: string | null;
};

export type ResolvedProductBadge = {
  text: string;
  style: ProductBadgeStyle;
};

export function normalizeProductBadgeStyle(value: unknown): ProductBadgeStyle {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "default";
  return (PRODUCT_BADGE_STYLES as readonly string[]).includes(normalized)
    ? normalized as ProductBadgeStyle
    : "default";
}

export function resolveStorefrontProductBadge(row: ProductBadgeRow): ResolvedProductBadge | undefined {
  const text = typeof row.badge_text === "string" ? row.badge_text.trim() : "";
  if (!text) return undefined;

  return {
    text,
    style: normalizeProductBadgeStyle(row.badge_style)
  };
}

export function resolveStorefrontBadgeText(row: ProductBadgeRow): string | undefined {
  return resolveStorefrontProductBadge(row)?.text;
}

export function readProductBadgeFieldsFromFormData(formData: FormData) {
  const hasBadgeFields = formData.has("badge_text") || formData.has("badge_style");

  if (!hasBadgeFields) return null;

  const rawText = formData.get("badge_text");
  const text = typeof rawText === "string" ? rawText.trim() : "";
  const style = normalizeProductBadgeStyle(formData.get("badge_style"));

  if (!PRODUCT_BADGE_STYLES.includes(style)) {
    throw new Error("Product badge style is invalid.");
  }

  if (text.length > PRODUCT_BADGE_TEXT_MAX) {
    throw new Error(`Ribbon text must be ${PRODUCT_BADGE_TEXT_MAX} characters or fewer.`);
  }

  const badgeText = text || null;

  return {
    badge_enabled: Boolean(badgeText),
    badge_text: badgeText,
    badge_style: style,
    badge: badgeText
  };
}

export function productBadgeCssClass(style: ProductBadgeStyle, variant: "showroom" | "pill" = "showroom") {
  if (variant === "pill") {
    return `product-badge product-badge--${style}`;
  }
  return `product-badge-showroom product-badge-showroom--${style}`;
}
