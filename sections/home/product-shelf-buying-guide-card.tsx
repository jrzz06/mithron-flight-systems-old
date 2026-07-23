import Link from "next/link";
import { MithronCardImage } from "@/components/media/mithron-card-image";
import type { MediaAsset } from "@/config/types";
import styles from "./product-shelf-buying-guide-card.module.css";

export function ProductShelfBuyingGuideCard({
  href,
  eyebrow,
  headline,
  image,
  priority = false
}: {
  href: string;
  eyebrow: string;
  headline: string;
  image: MediaAsset | null;
  priority?: boolean;
}) {
  const hasImage = Boolean(image);

  return (
    <Link
      href={href}
      className={hasImage ? `${styles.card} ${styles.cardWithImage}` : styles.card}
      data-testid="home-product-shelf-guide-card"
      data-has-image={hasImage ? "true" : undefined}
      aria-label={`${eyebrow}: ${headline}`}
    >
      <div className={styles.copy}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h3 className={styles.headline}>{headline}</h3>
      </div>
      {image ? (
        <div className={styles.imageFrame} aria-hidden="true">
          <span className={styles.cleanBackdrop} />
          <MithronCardImage
            src={image.src}
            alt=""
            aria-hidden
            fill
            priority={priority}
            responsive={image.responsive}
            sizes="(max-width: 1279px) 72vw, 280px"
            className={styles.image}
          />
        </div>
      ) : null}
    </Link>
  );
}
