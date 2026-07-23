import Link from "next/link";
import { ProductCardImage } from "@/components/media/product-card-image";
import { ProductRibbon } from "@/components/product/product-ribbon";
import {
  compactProductMeta,
  formatShelfProductName,
  type ProductShelfCardItem
} from "@/lib/product-shelf-card-meta";
import { formatINR } from "@/lib/utils";
import styles from "@/sections/home/home-shelf-shared.module.css";

export function HomeProductShelfCard({
  product,
  priority = false,
  layout = "default",
  imageSizes = "(max-width: 479px) 54vw, (max-width: 767px) 56vw, (max-width: 1279px) 32vw, 280px"
}: {
  product: ProductShelfCardItem;
  priority?: boolean;
  layout?: "default" | "dji";
  imageSizes?: string;
}) {
  const meta = compactProductMeta(product);
  const isDji = layout === "dji";

  return (
    <Link
      href={`/product/${product.slug}`}
      className={isDji ? `${styles.productCard} ${styles.productCardDji}` : styles.productCard}
      data-testid="home-product-card"
      data-shelf-card-layout={isDji ? "dji" : "default"}
    >
      <div className={styles.productImageWell}>
        <ProductCardImage
          product={product}
          decorative
          fill
          priority={priority}
          sizes={imageSizes}
          className={styles.productImage}
          placeholderClassName={styles.productImagePlaceholder}
        />
        <ProductRibbon text={product.badge} style={product.badgeStyle} />
      </div>
      <div className={styles.productBody}>
        {isDji ? (
          <>
            <h3 className={styles.productName}>{formatShelfProductName(product.name)}</h3>
            <p className={styles.productDescriptor} aria-hidden={!meta.detail || undefined}>
              <span>{meta.detail || "\u00A0"}</span>
            </p>
            <div className={styles.productFooterDji}>
              <p className={styles.productPriceDji}>{formatINR(product.price)}</p>
              <span className={styles.productBuyNowDji}>Buy Now</span>
            </div>
          </>
        ) : (
          <>
            <p className={styles.productKicker} aria-hidden={!meta.detail || undefined}>
              <span>{meta.detail || "\u00A0"}</span>
            </p>
            <h3 className={styles.productName}>{formatShelfProductName(product.name)}</h3>
            <div className={styles.productFooter}>
              <span className="type-price">{formatINR(product.price)}</span>
              <span className={styles.productBuyNow}>Buy Now</span>
              <span className={styles.productActionDot} aria-hidden="true" />
            </div>
          </>
        )}
      </div>
    </Link>
  );
}
