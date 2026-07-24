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
        "premium-product-card-shell group flex h-full flex-col justify-between overflow-hidden rounded-xl border border-gray-200/80 bg-white p-2.5 transition-all duration-200 hover:-translate-y-0.5 sm:p-3",
        className
      )}
    >
      <Link
        href={`/product/${product.slug}`}
        className="premium-product-card group flex h-full min-w-0 flex-1 flex-col justify-between overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        <div className="premium-product-card__media relative mb-2 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-gray-50/80 p-0">
          <div className="premium-product-card__image absolute inset-3 sm:inset-4">
            <ProductCardImage
              product={product}
              fill
              priority={priority}
              className="premium-product-card__image-asset h-full w-full max-h-full max-w-full object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-105"
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
 * Identical markup for /products, /category/*, and PDP “You May Also Like”.
 */
function CatalogProductCard({
  product,
  showCategory,
  priority,
  className
}: {
  product: ProductHoverCardProduct;
  showCategory: boolean;
  priority: boolean;
  className?: string;
}) {
  const description = getCatalogCardPreview(product);

  return (
    <article
      data-testid={`premium-product-card-${product.slug}`}
      data-card-variant="catalog"
      data-cta-layout="buy-row"
      className={cn(
        "premium-product-card-shell group flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white p-2.5 transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-gray-300 sm:p-3",
        className
      )}
    >
      <Link
        href={`/product/${product.slug}`}
        className="premium-product-card group flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        <div className="premium-product-card__media premium-product-card__media--catalog relative mb-2.5 flex h-36 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-50 p-0 sm:mb-3 sm:h-48">
          <div className="premium-product-card__image absolute inset-3">
            <ProductCardImage
              product={product}
              fill
              priority={priority}
              className="premium-product-card__image-asset h-full w-full max-h-full max-w-full object-contain mix-blend-multiply transition-transform duration-300 ease-out group-hover:scale-[1.06]"
              placeholderClassName="premium-product-card__image-placeholder"
              sizes={imageSizes.catalog}
            />
          </div>
          <ProductRibbon text={product.badge} style={product.badgeStyle} />
        </div>

        <div className="premium-product-card__body flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 flex-col gap-1">
            {showCategory ? (
              <p className="premium-product-card__category m-0 truncate text-[10px] font-bold uppercase leading-none tracking-[0.08em] text-emerald-700 sm:text-[11px]">
                {product.category || "\u00A0"}
              </p>
            ) : (
              <p className="premium-product-card__category m-0 truncate text-[10px] font-bold uppercase leading-none tracking-[0.08em] text-transparent sm:text-[11px]" aria-hidden>
                &nbsp;
              </p>
            )}

            <h3 className="premium-product-card__title m-0 line-clamp-2 min-h-[2.6em] text-[13px] font-extrabold leading-[1.3] tracking-tight text-slate-900 sm:text-sm md:text-[15px]">
              {formatShelfProductName(product.name)}
            </h3>

            <p
              data-testid={`premium-product-description-${product.slug}`}
              className="premium-product-card__description m-0 line-clamp-2 min-h-[2.8em] text-[11px] font-medium leading-[1.4] text-slate-500 sm:text-xs"
            >
              {description}
            </p>
          </div>

          <div className="premium-product-card__footer mt-auto flex min-w-0 flex-col items-stretch justify-start gap-2 border-t border-gray-100/90 pt-2.5 sm:pt-3">
            <div className="relative flex min-w-0 flex-col items-start gap-0.5">
              <span className="premium-product-card__price whitespace-nowrap text-xs font-extrabold tracking-tight text-slate-950 sm:text-sm">
                {formatINR(product.price)}
              </span>
              <span className="text-[10px] font-normal leading-none text-gray-400 sm:text-[11px]">
                Excl. GST
              </span>
            </div>
            <span className="premium-product-card__cta premium-product-card__cta-buy relative inline-flex w-full flex-shrink-0 items-center justify-center rounded-md bg-emerald-700 px-2.5 py-1.5 text-[10px] font-bold whitespace-nowrap text-white transition-all duration-200 hover:bg-emerald-800 hover:shadow-md focus-visible:bg-emerald-800 active:scale-[0.98] active:bg-emerald-900 sm:text-xs">
              Buy Now
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

function getCatalogCardPreview(product: ProductHoverCardProduct) {
  const clean = sanitizeProductPreviewText(product.tagline).trim();
  if (clean) return clipProductPreviewText(clean, 120);
  return clipProductPreviewText(product.category, 48);
}
