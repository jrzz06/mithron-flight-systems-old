import Link from "next/link";
import styles from "./product-shelf-view-all-compact-card.module.css";

export function ProductShelfViewAllCompactCard({
  href,
  label,
  sectionTitle
}: {
  href: string;
  label: string;
  sectionTitle?: string;
}) {
  const ariaLabel = sectionTitle ? `${label} ${sectionTitle}` : label;

  return (
    <Link
      href={href}
      className={styles.card}
      data-testid="home-product-view-all-card"
      aria-label={ariaLabel}
    >
      <span className={styles.label}>{label}</span>
    </Link>
  );
}
