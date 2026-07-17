import Link from "next/link";
import { MithronShelfHeroImage } from "@/components/media/mithron-shelf-hero-image";
import type { CmsInterShelfBanner } from "@/config/homepage-cms-v2";
import styles from "./home-inter-shelf-banner.module.css";

export function HomeInterShelfBanner({
  banner,
  testId,
  priority = false
}: {
  banner: CmsInterShelfBanner;
  testId: string;
  priority?: boolean;
}) {
  if (!banner.enabled || !banner.imageSrc.trim()) return null;

  const alignmentClass =
    banner.alignment === "center"
      ? styles.alignCenter
      : banner.alignment === "right"
        ? styles.alignRight
        : styles.alignLeft;

  return (
    <section
      id={testId}
      data-testid={testId}
      className={styles.section}
      data-home-content-shell="true"
      aria-label={banner.heading || "Promotional banner"}
    >
      <div className={styles.frame}>
        <MithronShelfHeroImage
          src={banner.imageSrc}
          alt={banner.imageAlt || banner.heading}
          fill
          priority={priority}
          className={styles.image}
          sizes="(max-width: 1536px) 100vw, 1536px"
        />
        <div
          className={styles.overlay}
          style={{ opacity: banner.overlayOpacity }}
          aria-hidden="true"
        />
        <div className={`${styles.copy} ${alignmentClass}`}>
          {banner.heading ? <h2 className={styles.heading}>{banner.heading}</h2> : null}
          {banner.subtitle ? <p className={styles.subtitle}>{banner.subtitle}</p> : null}
          {banner.ctaLabel && banner.href ? (
            <Link href={banner.href} className={styles.cta}>
              {banner.ctaLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
