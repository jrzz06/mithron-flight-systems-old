"use client";

import { DiscoveryProductGrid } from "@/sections/product/discovery-product-grid";
import { useRecentlyViewedProducts } from "@/hooks/use-recently-viewed-products";
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
        <DiscoveryProductGrid products={items} />
      </div>
    </section>
  );
}
