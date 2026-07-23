import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { memo } from "react";
import { ProductCardImage } from "@/components/media/product-card-image";
import { ProductRibbon } from "@/components/product/product-ribbon";
import type { Product } from "@/config/types";
import type { ProductCardImageSource } from "@/lib/media/catalog-card-image";
import { formatShelfProductName } from "@/lib/product-shelf-card-meta";
import { clipProductPreviewText, sanitizeProductPreviewText } from "@/lib/product-preview-text";
import { cn, formatINR } from "@/lib/utils";

type ProductHoverCardVariant = "rail" | "compact" | "catalog" | "related";
type ProductHoverCardCta = "pill" | "arrow" | "catalog";
type ProductHoverCardPresentation = "standard" | "showroom";

export type ProductHoverCardProduct = ProductCardImageSource & {
  slug: string;
  name: string;
  tagline: string;
  price: number;
  category: string;
  badge?: string;
  badgeStyle?: Product["badgeStyle"];
};

const imageHeights: Record<ProductHoverCardVariant, string> = {
  rail: "h-[280px] md:h-[390px]",
  compact: "h-[180px] md:h-[250px]",
  catalog: "",
  related: "h-44"
};

const imageSizes: Record<ProductHoverCardVariant, string> = {
  rail: "320px",
  compact: "260px",
  catalog: "(min-width:1280px) 25vw, (min-width:768px) 33vw, (min-width:360px) 50vw, 100vw",
  related: "240px"
};

export const ProductHoverCard = memo(function ProductHoverCard({
  product,
  variant = "rail",
  showCategory = false,
  cta = "pill",
  presentation: _presentation = "standard",
  priority = false,
  className
}: {
  product: ProductHoverCardProduct;
  variant?: ProductHoverCardVariant;
  showCategory?: boolean;
  cta?: ProductHoverCardCta;
  presentation?: ProductHoverCardPresentation;
  priority?: boolean;
  className?: string;
}) {
  const useBuyRow = cta === "catalog";
  const isCatalog = variant === "catalog";
  const description = isCatalog
    ? getCatalogCardPreview(product)
    : clipProductPreviewText(product.tagline, 88);

  return (
    <article
      data-testid={`premium-product-card-${product.slug}`}
      data-card-variant={variant}
      data-cta-layout={useBuyRow ? "buy-row" : undefined}
      className={cn("premium-product-card-shell flex h-full flex-col", className)}
    >
      <Link
        href={`/product/${product.slug}`}
        className="premium-product-card group flex h-full min-w-0 flex-1 flex-col overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[var(--storefront-product-card-accent)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-card)]"
      >
        <div
          className={cn(
            "premium-product-card__media relative overflow-hidden",
            isCatalog || useBuyRow
              ? "premium-product-card__media--catalog"
              : imageHeights[variant]
          )}
        >
          <div className="premium-product-card__image absolute inset-0">
            <ProductCardImage
              product={product}
              fill
              priority={priority}
              className="premium-product-card__image-asset object-contain"
              placeholderClassName="premium-product-card__image-placeholder"
              sizes={imageSizes[variant]}
            />
          </div>
          <ProductRibbon text={product.badge} style={product.badgeStyle} />
        </div>

        <div
          className={cn(
            "premium-product-card__body flex min-w-0 flex-1 flex-col",
            !isCatalog && "p-5"
          )}
        >
          {showCategory && isCatalog ? (
            <p className="premium-product-card__category token-category-label type-meta">
              {product.category}
            </p>
          ) : null}

          <h3
            className={cn(
              "premium-product-card__title token-product-title font-display line-clamp-2",
              !isCatalog &&
                "mb-1 font-semibold text-[18px] md:text-[19px] leading-[1.22] tracking-[-0.018em] text-[#09090b] dark:text-white min-h-[2.44em]",
              variant === "related" && !isCatalog ? "text-base min-h-[2.2em]" : ""
            )}
          >
            {formatShelfProductName(product.name)}
          </h3>

          {showCategory && !isCatalog ? (
            <p className="premium-product-card__category token-category-label type-meta mb-1.5 font-semibold text-[#71717a] dark:text-[#94a3b8]">
              {product.category}
            </p>
          ) : null}

          <p
            data-testid={`premium-product-description-${product.slug}`}
            className={cn(
              "premium-product-card__description token-description line-clamp-2",
              !isCatalog &&
                "mb-4 text-[13px] font-normal leading-[1.45] tracking-[-0.003em] text-[#52525b] dark:text-[#94a3b8] min-h-[2.9em]"
            )}
          >
            {description}
          </p>

          <div
            className={cn(
              "premium-product-card__footer flex min-w-0 items-center justify-between gap-3 mt-auto",
              !isCatalog && "pt-3 border-t border-black/[0.05] dark:border-white/[0.08]"
            )}
          >
            {cta === "pill" ? (
              <span className="premium-product-card__cta premium-product-card__cta-pill token-button-sm inline-flex items-center justify-center rounded-full text-xs bg-[#09090b] text-white hover:bg-black/90 dark:bg-white dark:text-[#09090b] transition-all duration-200">
                Get a quote
              </span>
            ) : cta === "arrow" ? (
              <span
                aria-hidden
                className="premium-product-card__cta premium-product-card__cta-pill grid size-[40px] place-items-center rounded-full bg-[#09090b] text-white hover:bg-black/90 dark:bg-white dark:text-[#09090b] transition-all duration-200"
              >
                <ArrowRight className="size-4" />
              </span>
            ) : (
              <>
                <span className="premium-product-card__price token-price shrink-0">
                  {formatINR(product.price)}
                </span>
                <span className="premium-product-card__cta premium-product-card__cta-buy token-button-sm inline-flex items-center justify-center gap-1.5">
                  Buy Now
                  <ArrowRight aria-hidden className="size-4 shrink-0 transition-transform duration-250 group-hover:translate-x-0.5" />
                </span>
              </>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
});

function getCatalogCardPreview(product: ProductHoverCardProduct) {
  const clean = sanitizeProductPreviewText(product.tagline).trim();
  if (clean) return clipProductPreviewText(clean, 120);
  return clipProductPreviewText(product.category, 48);
}
