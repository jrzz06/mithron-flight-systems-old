import type { ReactNode } from "react";
import styles from "./product-showcase.module.css";

export function ProductShowcaseHero({
  gallery,
  purchase
}: {
  gallery: ReactNode;
  purchase: ReactNode;
}) {
  return (
    <section className={styles.heroSection} aria-label="Product showcase">
      <div className={styles.heroGrid}>
        <div className={styles.heroMediaCol}>{gallery}</div>
        <div className={styles.heroBuyCol}>
          <div className={styles.purchaseStack}>{purchase}</div>
        </div>
      </div>
    </section>
  );
}
