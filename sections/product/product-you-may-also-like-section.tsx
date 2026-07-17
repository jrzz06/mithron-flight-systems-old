import type { ProductShellItem } from "@/services/catalog";
import { DiscoveryProductGrid } from "@/sections/product/discovery-product-grid";
import styles from "./product-discovery.module.css";

export function ProductYouMayAlsoLikeSection({ products }: { products: ProductShellItem[] }) {
  if (!products.length) return null;

  return (
    <section
      id="related"
      className={`${styles.discoverySection} ${styles.relatedSection}`}
      aria-labelledby="product-related-title"
    >
      <div className={styles.discoveryInner}>
        <h2 id="product-related-title" className={styles.discoverySectionTitle}>
          You May Also Like
        </h2>
        <DiscoveryProductGrid products={products} />
      </div>
    </section>
  );
}
