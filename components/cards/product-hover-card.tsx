import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { memo } from "react";
import { ProductCardImage } from "@/components/media/product-card-image";
import { ProductRibbon } from "@/components/product/product-ribbon";
import type { Product } from "@/config/types";
import type { ProductCardImageSource } from "@/lib/media/catalog-card-image";
import { formatShelfProductName } from "@/lib/product-shelf-card-meta";
import { clipProductPreviewText, sanitizeProductPreviewText } from "@/lib/product-preview-text";
import { HomeProductShelfCard } from "@/components/product/home-product-shelf-card";
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

const imageSizes: Record<ProductHoverCardVariant, string> = {
  rail: "320px",
  compact: "260px",
  catalog: "(min-width:1024px) 25vw, 50vw",
  related: "(min-width:1024px) 25vw, 50vw"
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
  if (variant === "catalog" || variant === "related") {
    return (
      <CatalogProductCard
        product={product}
        showCategory={showCategory || variant === "related"}
        priority={priority}
        className={className}
      />
    );
  }

  const description = clipProductPreviewText(product.tagline, 88);

  return (
    <article
      data-testid={`premium-product-card-${product.slug}`}
      data-card-variant={variant}
      className={cn(
        "premium-product-card-shell group flex h-full flex-col justify-between overflow-hidden rounded-xl border border-black/5 bg-white transition-colors duration-200 hover:-translate-y-0.5",
        className
      )}
    >
      <Link
        href={`/product/${product.slug}`}
        className="premium-product-card group flex h-full min-w-0 flex-1 flex-col justify-between overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        <div className="premium-product-card__media relative mb-2 flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-transparent p-0">
          <div className="premium-product-card__image absolute inset-3 sm:inset-4">
            <ProductCardImage
              product={product}
              fill
              priority={priority}
              className="premium-product-card__image-asset h-full w-full max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
              placeholderClassName="premium-product-card__image-placeholder"
              sizes={imageSizes[variant]}
            />
          </div>
          <ProductRibbon text={product.badge} style={product.badgeStyle} />
        </div>

        <div className="premium-product-card__body flex min-w-0 flex-1 flex-col justify-between p-1 sm:p-1.5">
          <div>
            {showCategory ? (
              <p className="premium-product-card__category mb-1 text-[9px] font-bold uppercase tracking-wider text-emerald-700 sm:text-[10px] md:text-xs leading-none">
                {product.category}
              </p>
            ) : null}

            <h3 className="premium-product-card__title mb-1 line-clamp-2 min-h-[2.4rem] text-[13px] font-extrabold leading-snug tracking-tight text-gray-900 sm:text-sm md:text-[15px]">
              {formatShelfProductName(product.name)}
            </h3>

            <p
              data-testid={`premium-product-description-${product.slug}`}
              className="premium-product-card__description mb-2 line-clamp-2 min-h-[2.1rem] text-[11px] font-normal leading-normal text-slate-500 sm:min-h-[2.4rem] sm:text-xs"
            >
              {description}
            </p>
          </div>

          <div className="premium-product-card__footer mt-auto flex items-center justify-between gap-1.5 border-t border-gray-100/90 pt-2 min-w-0">
            {cta === "pill" ? (
              <span className="premium-product-card__cta premium-product-card__cta-pill shrink-0 rounded-md bg-emerald-700 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-xs transition-colors duration-200 hover:bg-emerald-800 sm:px-3 sm:py-1.5 sm:text-xs whitespace-nowrap">
                Get a quote
              </span>
            ) : cta === "arrow" ? (
              <span
                aria-hidden
                className="premium-product-card__cta premium-product-card__cta-pill grid size-[32px] place-items-center rounded-full bg-emerald-700 text-white transition-colors duration-200 hover:bg-emerald-800"
              >
                <ArrowRight className="size-4" />
              </span>
            ) : (
              <>
                <span className="premium-product-card__price whitespace-nowrap text-xs font-bold tracking-tight text-gray-900 sm:text-sm md:text-[15px]">
                  {formatINR(product.price)}
                </span>
                <span className="premium-product-card__cta premium-product-card__cta-buy shrink-0 rounded-md bg-emerald-700 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-xs transition-colors duration-200 hover:bg-emerald-800 sm:px-3 sm:py-1.5 sm:text-xs whitespace-nowrap">
                  Buy Now
                </span>
              </>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
});

/**
 * Shared catalog / listing / recommend card.
 * Uses single source of truth <HomeProductShelfCard /> across /products, /category/*, and PDP "You May Also Like".
 */
function CatalogProductCard({
  product,
  showCategory: _showCategory,
  priority,
  className
}: {
  product: ProductHoverCardProduct;
  showCategory: boolean;
  priority: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <HomeProductShelfCard
        product={product}
        layout="dji"
        presentation="catalog"
        priority={priority}
      />
    </div>
  );
}

function getCatalogCardPreview(product: ProductHoverCardProduct) {
  const clean = sanitizeProductPreviewText(product.tagline).trim();
  return clean ? clipProductPreviewText(clean, 110) : "";
}
