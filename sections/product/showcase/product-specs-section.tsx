import type { Product } from "@/config/types";
import { getCustomerFacingSpecs } from "@/lib/product-detail-content";
import styles from "./product-showcase.module.css";

export function ProductSpecsSection({ product }: { product: Product }) {
  const specs = getCustomerFacingSpecs(product);
  if (!specs.length) return null;

  return (
    <section id="product-specs" className={styles.specsSection} aria-label="Key specifications">
      <div className={styles.specsInner}>
        <h2 className={styles.specsHeading}>Key specifications</h2>
        <div className={styles.specGroup}>
          <div className={styles.specTable} role="table">
            {specs.map(([key, value]) => (
              <div key={key} className={styles.specRow} role="row">
                <div className={styles.specKey} role="rowheader">
                  {key}
                </div>
                <div className={styles.specValue} role="cell">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
