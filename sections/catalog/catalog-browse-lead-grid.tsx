import { ProductHoverCard } from "@/components/cards/product-hover-card";
import type { Product } from "@/config/types";
import type { CSSProperties } from "react";
import Link from "next/link";
import { ProductCardImage } from "@/components/media/product-card-image";
import { cn } from "@/lib/utils";
import styles from "./catalog-page.module.css";

type CatalogBrowseLeadGridProps = {
  products: Product[];
  isShowroom: boolean;
  cardPresentation: "standard" | "showroom";
  featuredProduct: Product | null;
  showEditorialBand: boolean;
  editorialPresentation: { scale: number; objectPosition: string } | null;
  getCatalogPreview: (text: string, maxLength: number) => string;
};

export function CatalogBrowseLeadGrid({
  products,
  isShowroom,
  cardPresentation,
  featuredProduct,
  showEditorialBand,
  editorialPresentation,
  getCatalogPreview
}: CatalogBrowseLeadGridProps) {
  return (
    <>
      <div className={isShowroom ? styles.productGrid : "catalog-product-grid min-w-0"}>
        {products.map((product, index) => (
          <ProductHoverCard
            key={product.slug}
            product={product}
            variant="catalog"
            showCategory
            cta="catalog"
            presentation={cardPresentation}
            priority={index < 4}
          />
        ))}
      </div>

      {showEditorialBand && featuredProduct ? (
        <Link
          href={`/product/${featuredProduct.slug}`}
          className={cn(isShowroom ? styles.editorialBand : "catalog-editorial-band")}
          data-testid="catalog-editorial-band"
        >
          {!isShowroom ? <div className="catalog-editorial-band__aurora" aria-hidden /> : null}
          <div className={isShowroom ? styles.editorialCopy : "catalog-editorial-band__copy"}>
            <p className={isShowroom ? styles.editorialEyebrow : "catalog-editorial-band__eyebrow type-meta"}>
              Featured
            </p>
            <h2 className={isShowroom ? styles.editorialTitle : "catalog-editorial-band__title type-card-title"}>
              {featuredProduct.name}
            </h2>
            <p className={isShowroom ? styles.editorialDescription : "catalog-editorial-band__description type-body"}>
              {getCatalogPreview(featuredProduct.tagline, isShowroom ? 124 : 190)}
            </p>
            <span className={isShowroom ? styles.editorialCta : "catalog-editorial-band__cta-buy type-button"}>
              {isShowroom ? "View product" : "Buy Now"}
            </span>
          </div>
          <div
            className={isShowroom ? styles.editorialMedia : "catalog-editorial-band__media"}
            style={
              !isShowroom && editorialPresentation
                ? ({
                    "--editorial-image-scale": editorialPresentation.scale,
                    "--editorial-image-position": editorialPresentation.objectPosition
                  } as CSSProperties)
                : undefined
            }
            aria-hidden
          >
            <ProductCardImage
              product={featuredProduct}
              fill
              className={cn(
                isShowroom ? styles.editorialImage : "catalog-editorial-band__image",
                !isShowroom && "object-contain"
              )}
              placeholderClassName={
                isShowroom ? styles.editorialImagePlaceholder : "catalog-editorial-band__image-placeholder"
              }
              sizes="(min-width: 1024px) 420px, 72vw"
            />
          </div>
        </Link>
      ) : null}
    </>
  );
}
