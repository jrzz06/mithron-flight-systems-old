import Link from "next/link";
import { ProductHoverCard } from "@/components/cards/product-hover-card";
import type { ProductShellItem } from "@/services/catalog";
import styles from "./product-detail.module.css";
import showcaseStyles from "./showcase/product-showcase.module.css";

function RelatedRail({ title, items }: { title: string; items: ProductShellItem[] }) {
  if (!items.length) return null;

  return (
    <div className={showcaseStyles.relatedRail}>
      <h3 className={showcaseStyles.relatedRailTitle}>{title}</h3>
      <div className={styles.relatedProductGrid}>
        {items.map((item) => (
          <ProductHoverCard
            key={item.slug}
            product={item}
            variant="catalog"
            showCategory
            cta="catalog"
          />
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
