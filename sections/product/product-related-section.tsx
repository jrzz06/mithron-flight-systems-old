import Link from "next/link";
import { ArrowRight } from "@/components/icons/storefront-icons";
import { ProductCardImage } from "@/components/media/product-card-image";
import { clipProductPreviewText } from "@/lib/product-preview-text";
import { formatINR } from "@/lib/utils";
import type { ProductShellItem } from "@/services/catalog";
import styles from "./product-detail.module.css";
import showcaseStyles from "./showcase/product-showcase.module.css";

function ProductRelatedCard({ item }: { item: ProductShellItem }) {
  const description = clipProductPreviewText(item.tagline, 88);

  return (
    <article className={styles.relatedCard}>
      <Link href={`/product/${item.slug}`} className={styles.relatedCardLink}>
        <div className={styles.relatedCardMedia}>
          <div className={styles.relatedCardMediaGlow} aria-hidden="true" />
          <div className={styles.relatedCardImageFrame}>
            <ProductCardImage
              product={item}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
              className={styles.relatedCardImage}
              placeholderClassName={styles.relatedCardImagePlaceholder}
            />
          </div>
        </div>

        <div className={styles.relatedCardBody}>
          <p className={styles.relatedCardCategory}>{item.category}</p>
          <h3 className={styles.relatedCardTitle}>{item.name}</h3>
          <p className={styles.relatedCardDescription}>{description}</p>
          <div className={styles.relatedCardFooter}>
            <span className={styles.relatedCardCta} aria-hidden="true">
              <ArrowRight className="size-4" />
            </span>
            <p className={styles.relatedCardPrice}>From {formatINR(item.price)}</p>
          </div>
        </div>
      </Link>
    </article>
  );
}

function RelatedRail({ title, items }: { title: string; items: ProductShellItem[] }) {
  if (!items.length) return null;

  return (
    <div className={showcaseStyles.relatedRail}>
      <h3 className={showcaseStyles.relatedRailTitle}>{title}</h3>
      <div className={styles.relatedProductGrid}>
        {items.map((item) => (
          <ProductRelatedCard key={item.slug} item={item} />
        ))}
      </div>
    </div>
  );
}

export function ProductRelatedSection({
  relatedProducts,
  similarProducts,
  accessoryProducts
}: {
  relatedProducts?: ProductShellItem[];
  similarProducts?: ProductShellItem[];
  accessoryProducts?: ProductShellItem[];
}) {
  const similar = similarProducts ?? relatedProducts ?? [];
  const accessories = accessoryProducts ?? [];
  const hasRails = similar.length > 0 || accessories.length > 0;

  if (!hasRails) return null;

  return (
    <section id="related" className={styles.relatedSection} aria-labelledby="product-related-title">
      <div className={styles.relatedInner}>
        <div className={styles.relatedSectionHeader}>
          <div>
            <h2 id="product-related-title" className={styles.relatedSectionTitle}>
              Recommended next
            </h2>
            <p className={styles.relatedSectionSubtitle}>Similar products and compatible accessories for your needs.</p>
          </div>
          <Link href="/products" className={styles.relatedSectionLink}>
            View all
          </Link>
        </div>
        <RelatedRail title="Related products" items={similar} />
        <RelatedRail title="Accessories and add-ons" items={accessories} />
      </div>
    </section>
  );
}
