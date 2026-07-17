import Link from "next/link";
import styles from "./product-discovery.module.css";

const EXPLORE_CATEGORIES = [
  { label: "Creative Drones", href: "/category/creative-drones" },
  { label: "Survey Drones", href: "/category/survey-drones" },
  { label: "Agri Drones", href: "/category/agri-drones" },
  { label: "Accessories", href: "/category/accessories" },
  { label: "Industrial", href: "/category/surveillance-drones" }
] as const;

export function ProductContinueExploringSection() {
  return (
    <section
      id="explore"
      className={`${styles.discoverySection} ${styles.exploreSection}`}
      aria-labelledby="product-explore-title"
    >
      <div className={styles.discoveryInner}>
        <h2 id="product-explore-title" className={styles.discoverySectionTitle}>
          Continue Exploring
        </h2>
        <nav className={styles.exploreChipList} aria-label="Product categories">
          {EXPLORE_CATEGORIES.map((category) => (
            <Link key={category.href} href={category.href} className={styles.exploreChip}>
              {category.label}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
