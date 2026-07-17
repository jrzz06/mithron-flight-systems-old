import Link from "next/link";
import { MithronShelfHeroImage } from "@/components/media/mithron-shelf-hero-image";
import type { CmsFullViewportBanner } from "@/config/homepage-cms-v2";
import styles from "./home-full-viewport-banner.module.css";

export function HomeFullViewportBanner({
  banner,
  testId,
  priority = true
}: {
  banner: CmsFullViewportBanner;
  testId: string;
  priority?: boolean;
}) {
  if (!banner.enabled) return null;
  const desktopSrc = banner.desktopImageSrc.trim();
  const mobileSrc = banner.mobileImageSrc.trim() || desktopSrc;
  if (!desktopSrc && !mobileSrc) return null;

  const alignmentClass =
    banner.alignment === "center"
      ? styles.alignCenter
      : banner.alignment === "right"
        ? styles.alignRight
        : styles.alignLeft;

  return (
    <section id={testId} data-testid={testId} className={styles.section} aria-label={banner.heading || "Full viewport banner"}>
      <div className={styles.frame}>
        {desktopSrc ? (
          <MithronShelfHeroImage
            src={desktopSrc}
            alt={banner.desktopImageAlt || banner.heading}
            fill
            priority={priority}
            className={`${styles.image} ${styles.imageDesktop}`}
            sizes="(max-width: 1536px) 100vw, 1536px"
          />
        ) : null}
        {mobileSrc ? (
          <MithronShelfHeroImage
            src={mobileSrc}
            alt={banner.mobileImageAlt || banner.heading}
            fill
            priority={priority}
            className={`${styles.image} ${styles.imageMobile}`}
            sizes="(max-width: 1536px) 100vw, 1536px"
          />
        ) : null}
        <div className={styles.overlay} style={{ opacity: banner.overlayOpacity }} aria-hidden="true" />
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
