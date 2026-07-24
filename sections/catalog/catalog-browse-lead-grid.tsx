import { HomeProductShelfCard } from "@/components/product/home-product-shelf-card";
import type { Product } from "@/config/types";
import type { CSSProperties } from "react";
import { ProductCardImage } from "@/components/media/product-card-image";
import { ProductLink } from "@/components/navigation/product-link";
import { ProductSharedMedia } from "@/components/navigation/product-shared-media";
import { cn } from "@/lib/utils";
import styles from "./catalog-page.module.css";

const CATALOG_IMAGE_SIZES = "(min-width:1024px) 25vw, 50vw";

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
  cardPresentation: _cardPresentation,
  featuredProduct,
  showEditorialBand,
  editorialPresentation,
  getCatalogPreview
}: CatalogBrowseLeadGridProps) {
  return (
    <>
      <div
        className={cn("w-full justify-items-stretch", isShowroom ? styles.productGrid : "catalog-product-grid min-w-0")}
        data-catalog-shelf-cards=""
      >
        {products.map((product, index) => (
          <HomeProductShelfCard
            key={product.slug}
            product={product}
            layout="dji"
            presentation="catalog"
            priority={index < 4}
            imageSizes={CATALOG_IMAGE_SIZES}
          />
        ))}
      </div>

      {showEditorialBand && featuredProduct ? (
        <ProductLink
          slug={featuredProduct.slug}
          prefetchImageSrc={featuredProduct.image?.src}
          className={cn(isShowroom ? styles.editorialBand : "catalog-editorial-band")}
          data-testid="catalog-editorial-band"
        >
          {!isShowroom ? (
            <>
              <span className="catalog-editorial-band__mesh" aria-hidden="true" />
              <span className="catalog-editorial-band__texture" aria-hidden="true" />
            </>
          ) : null}
          <div className={isShowroom ? styles.editorialCopy : "catalog-editorial-band__copy"}>
            <p className={isShowroom ? styles.editorialEyebrow : "catalog-editorial-band__eyebrow type-meta"}>
              {isShowroom ? "Featured" : "— Featured"}
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
                    "--editorial-image-scale": Math.min(editorialPresentation.scale, 0.95),
                    "--editorial-image-position": editorialPresentation.objectPosition
                  } as CSSProperties)
                : undefined
            }
            aria-hidden
          >
            {!isShowroom ? <span className="catalog-editorial-band__glow" aria-hidden="true" /> : null}
            <ProductSharedMedia slug={featuredProduct.slug}>
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
            </ProductSharedMedia>
          </div>
        </ProductLink>
      ) : null}
    </>
  );
}
