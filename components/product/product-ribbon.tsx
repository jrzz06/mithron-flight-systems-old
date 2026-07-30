import { normalizeProductBadgeStyle, productBadgeCssClass, type ProductBadgeStyle } from "@/lib/product-badge";
import { cn } from "@/lib/utils";
import styles from "./product-ribbon.module.css";

export function ProductRibbon({
  text,
  style = "default",
  placement = "overlay",
  className
}: {
  text?: string | null;
  style?: ProductBadgeStyle | string | null;
  /** overlay = absolute on card image; inline = static under PDP title */
  placement?: "overlay" | "inline";
  className?: string;
}) {
  const label = typeof text === "string" ? text.trim() : "";
  if (!label) return null;

  const normalizedStyle = normalizeProductBadgeStyle(style ?? "default");

  return (
    <span
      className={cn(
        styles.ribbon,
        placement === "inline" ? styles.ribbonInline : styles.ribbonOverlay,
        productBadgeCssClass(normalizedStyle, "showroom"),
        className
      )}
      aria-label={`Product ribbon: ${label}`}
    >
      {label}
    </span>
  );
}
