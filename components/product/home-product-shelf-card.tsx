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
  imageSizes = "(max-width: 479px) 54vw, (max-width: 767px) 56vw, (max-width: 1279px) 32vw, 280px"
}: {
  product: ProductShelfCardItem;
  priority?: boolean;
  imageSizes?: string;
}) {
  const meta = compactProductMeta(product);

  return (
    <Link
      href={`/product/${product.slug}`}
      className={styles.productCard}
      data-testid="home-product-card"
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
        {meta.detail ? (
          <p className={styles.productKicker}>
            <span>{meta.detail}</span>
          </p>
        ) : null}
        <h3 className={styles.productName}>{formatShelfProductName(product.name)}</h3>
        <div className={styles.productFooter}>
          <span className="type-price">{formatINR(product.price)}</span>
          <span className={styles.productBuyNow}>Buy Now</span>
          <span className={styles.productActionDot} aria-hidden="true" />
        </div>
      </div>
    </Link>
  );
}
