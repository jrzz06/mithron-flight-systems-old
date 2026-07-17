"use client";

import { HomeProductShelfCard } from "@/components/product/home-product-shelf-card";
import { useRecentlyViewedProducts } from "@/hooks/use-recently-viewed-products";
import homeStyles from "@/sections/home/home-shelf-shared.module.css";
import styles from "./product-discovery.module.css";

export function ProductRecentlyViewedSection({ currentSlug }: { currentSlug: string }) {
  const items = useRecentlyViewedProducts(currentSlug);
  if (!items.length) return null;

  return (
    <section
      id="recently-viewed"
      className={`${styles.discoverySection} ${styles.recentSection}`}
      aria-labelledby="product-recent-title"
    >
      <div className={styles.discoveryInner}>
        <h2 id="product-recent-title" className={styles.discoverySectionTitle}>
          Recently Viewed
        </h2>
        <div className={`${homeStyles.productShelfSection} ${styles.shelfToneWorld}`} data-shelf-tone="world">
          <div className={styles.discoveryProductGrid}>
            {items.map((product, index) => (
              <div key={product.slug} className={styles.discoveryProductGridItem}>
                <HomeProductShelfCard
                  product={product}
                  priority={index === 0}
                  imageSizes="(max-width: 639px) 92vw, (max-width: 1023px) 46vw, 22vw"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
