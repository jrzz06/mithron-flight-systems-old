import Link from "next/link";
import { Star } from "lucide-react";
import { ProductCardImage } from "@/components/media/product-card-image";
import { ProductRibbon } from "@/components/product/product-ribbon";
import {
  formatShelfProductName,
  getCatalogGstLabel,
  type ProductShelfCardItem
} from "@/lib/product-shelf-card-meta";
import { getProductMarketingTagline } from "@/lib/product-marketing-copy";
import { cn, formatINR } from "@/lib/utils";
import styles from "@/sections/home/home-shelf-shared.module.css";

function CatalogStarRating({
  rating,
  reviewCount
}: {
  rating?: number | null;
  reviewCount?: number | null;
}) {
  const hasRating = typeof rating === "number" && Number.isFinite(rating) && rating > 0;
  if (!hasRating) {
    return null;
  }

  const clamped = Math.max(0, Math.min(5, rating));
  const full = Math.floor(clamped);
  const hasHalf = clamped - full >= 0.4 && clamped - full < 0.9;
  const label = clamped.toFixed(1);

  return (
    <div
      className="my-1 inline-flex items-center gap-1.5"
      data-catalog-card-rating=""
      aria-label={`${label} out of 5 stars`}
    >
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, index) => {
          const isFull = index < full;
          const isHalf = index === full && hasHalf;
          return (
            <Star
              key={index}
              className={cn(
                "h-4 w-4 shrink-0",
                isFull
                  ? "fill-[#F59E0B] text-[#F59E0B]"
                  : isHalf
                    ? "fill-[#F59E0B]/50 text-[#F59E0B]"
                    : "fill-gray-100 text-gray-300"
              )}
              strokeWidth={1.5}
            />
          );
        })}
      </span>
      <span className="font-mono text-xs font-semibold tabular-nums text-gray-700">
        {label}
      </span>
      {typeof reviewCount === "number" && reviewCount > 0 ? (
        <span className="text-xs font-normal text-gray-500">
          ({reviewCount})
        </span>
      ) : null}
    </div>
  );
}

export function HomeProductShelfCard({
  product,
  priority = false,
  layout = "default",
  presentation = "shelf",
  imageSizes = "(max-width: 479px) 54vw, (max-width: 767px) 56vw, (max-width: 1279px) 32vw, 280px"
}: {
  product: ProductShelfCardItem;
  priority?: boolean;
  layout?: "default" | "dji";
  /** Catalog listings get rating, GST note, 2-line title/desc. Homepage stays "shelf". */
  presentation?: "shelf" | "catalog";
  imageSizes?: string;
}) {
  const description = getProductMarketingTagline({
    name: product.name,
    category: product.category,
    tagline: product.tagline
  });
  const isDji = layout === "dji";
  const isCatalog = presentation === "catalog";
  const rating =
    typeof product.rating === "number" && product.rating > 0 ? product.rating : null;
  const gstLabel = isCatalog ? getCatalogGstLabel(product) : null;
  const compareAt =
    typeof product.compareAt === "number" &&
    Number.isFinite(product.compareAt) &&
    product.compareAt > product.price
      ? product.compareAt
      : null;

  if (isDji) {
    return (
      <Link
        href={`/product/${product.slug}`}
        className={cn(
          "premium-product-card-shell group flex w-full h-full flex-col overflow-hidden bg-white",
          isCatalog
            ? "rounded-xl border border-gray-200/90 p-2.5 lg:p-3"
            : "border border-gray-200/80",
          styles.productCard,
          styles.productCardDji,
          isCatalog && styles.productCardCatalog
        )}
        data-testid="home-product-card"
        data-shelf-card-layout="dji"
        data-card-presentation={isCatalog ? "catalog" : "shelf"}
      >
        <div
          className={cn(
            "relative mb-0 flex w-full items-center justify-center overflow-hidden p-0",
            isCatalog
              ? "aspect-[4/3] shrink-0 rounded-lg bg-gray-50"
              : "aspect-[4/3] rounded-md bg-gray-50/80",
            styles.productImageWell
          )}
        >
          {/* ~8–12px breathing room; higher cutout scale crops PNG margins */}
          <div className={cn("absolute", isCatalog ? "inset-2" : "inset-2.5 sm:inset-3")}>
            <ProductCardImage
              product={product}
              decorative
              fill
              priority={priority}
              sizes={imageSizes}
              className={cn("h-full w-full max-h-full max-w-full object-contain", styles.productImage)}
              placeholderClassName={styles.productImagePlaceholder}
            />
          </div>
          <ProductRibbon text={product.badge} style={product.badgeStyle} />
        </div>
        <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", styles.productBody)}>
          <div className={cn("flex min-w-0 flex-col", isCatalog && styles.productMetaStackCatalog)}>
            <p className={cn(styles.productKicker)}>{product.category || "\u00A0"}</p>
            {isCatalog ? <CatalogStarRating rating={rating} reviewCount={product.reviewCount} /> : null}
            <h3
              className={cn(
                "line-clamp-2",
                styles.productName,
                isCatalog && styles.productNameCatalog
              )}
            >
              {formatShelfProductName(product.name)}
            </h3>
            <p
              className={cn(
                "line-clamp-2",
                styles.productDescriptor,
                isCatalog && styles.productDescriptorFixed
              )}
            >
              {description || "\u00A0"}
            </p>
          </div>
          <div
            className={cn(
              "mt-auto flex min-w-0",
              isCatalog
                ? "relative flex-col items-stretch justify-start gap-2"
                : "items-center justify-between gap-3 border-t border-gray-100 pt-4",
              styles.productFooterDji,
              isCatalog && styles.productFooterCatalog
            )}
          >
            <div className={cn("relative min-w-0", styles.productPriceBlock, isCatalog && styles.productPriceBlockCatalog)}>
              {isCatalog ? (
                <span
                  className={styles.productCompareAt}
                  data-catalog-compare-at=""
                  data-empty={compareAt ? "false" : "true"}
                  aria-hidden={compareAt ? undefined : true}
                >
                  {compareAt ? formatINR(compareAt) : "\u00A0"}
                </span>
              ) : null}
              <span
                className={cn(
                  "whitespace-nowrap",
                  styles.productPriceDji,
                  isCatalog && styles.productPriceCatalog
                )}
              >
                {formatINR(product.price)}
              </span>
              {gstLabel ? (
                <span className={styles.productGstNote} data-catalog-gst-note="">
                  {gstLabel}
                </span>
              ) : null}
            </div>
            <span
              className={cn(
                "relative flex-shrink-0",
                isCatalog && "w-full",
                styles.productBuyNowDji,
                isCatalog && styles.productBuyNowCatalog
              )}
            >
              Buy Now
            </span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/product/${product.slug}`}
      className={cn(
        "premium-product-card-shell group flex h-full flex-col justify-between overflow-hidden rounded-xl border border-gray-200/80 bg-white p-2 sm:p-2.5",
        styles.productCard
      )}
      data-testid="home-product-card"
      data-shelf-card-layout="default"
    >
      <div
        className={cn(
          "relative mb-1.5 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-gray-50/80 p-0",
          styles.productImageWell
        )}
      >
        <div className="absolute inset-2 sm:inset-3">
          <ProductCardImage
            product={product}
            decorative
            fill
            priority={priority}
            sizes={imageSizes}
            className={cn(
              "h-full w-full max-h-full max-w-full object-contain mix-blend-multiply",
              styles.productImage
            )}
            placeholderClassName={styles.productImagePlaceholder}
          />
        </div>
        <ProductRibbon text={product.badge} style={product.badgeStyle} />
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-col justify-between p-1 sm:p-1.5", styles.productBody)}>
        <div>
          <p
            className={cn(
              "mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-700 sm:text-[10px] md:text-xs leading-none",
              styles.productKicker
            )}
          >
            {product.category || "\u00A0"}
          </p>
          <h3
            className={cn(
              "mb-1 line-clamp-2 min-h-0 text-[13px] font-semibold leading-snug tracking-tight text-gray-900 sm:text-sm md:text-[15px]",
              styles.productName
            )}
          >
            {formatShelfProductName(product.name)}
          </h3>
          <p
            className={cn(
              "mb-1.5 line-clamp-2 min-h-0 text-[11px] font-normal leading-normal text-slate-500 sm:text-xs",
              styles.productDescriptor
            )}
          >
            {description}
          </p>
        </div>
        <div
          className={cn(
            "mt-auto flex items-center justify-between gap-1.5 border-t border-gray-100/90 pt-2 min-w-0",
            styles.productFooter
          )}
        >
          <span className="whitespace-nowrap text-xs font-bold tracking-tight text-gray-900 sm:text-sm md:text-[15px] type-price">
            {formatINR(product.price)}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-md bg-emerald-700 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-xs transition-colors duration-300 hover:bg-emerald-800 sm:px-3 sm:py-1.5 sm:text-xs whitespace-nowrap",
              styles.productBuyNow
            )}
          >
            Buy Now
          </span>
        </div>
      </div>
    </Link>
  );
}
