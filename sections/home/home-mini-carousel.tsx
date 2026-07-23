"use client";

import Link from "next/link";
import { HorizontalScrollTouchRail } from "@/components/ui/horizontal-scroll-touch-rail";
import { MithronThumbImage } from "@/components/media/mithron-thumb-image";
import type { HomeMiniCarouselItem } from "@/lib/home/mini-carousel";
import styles from "./home-landing-composite.module.css";

export function HomeMiniCarousel({
  items
}: {
  items: HomeMiniCarouselItem[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      id="home-mini-carousel"
      className={styles.miniCarousel}
      data-testid="home-mini-carousel"
      data-carousel-kind="product"
      data-media-state={items.some((item) => item.sourceState === "VERIFIED") ? "VERIFIED" : "FALLBACK"}
    >
      <div className={styles.miniCarouselViewport}>
        <HorizontalScrollTouchRail
          className={styles.miniCarouselRail}
          data-testid="home-mini-carousel-rail"
          aria-label="Mithron product category carousel"
        >
          {items.map((item) => (
            <Link
              href={item.href}
              className={styles.miniCarouselItem}
              data-testid="home-mini-carousel-item"
              data-media-state={item.sourceState}
              key={item.itemKey}
              title={item.fullLabel}
            >
              <span className={styles.miniCarouselImageWell}>
                <MithronThumbImage
                  src={item.media.src}
                  alt=""
                  aria-hidden={true}
                  fill
                  responsive={item.media.responsive}
                  sizes="(max-width: 640px) 92px, 128px"
                  className={styles.miniCarouselImage}
                />
              </span>
              <span className={styles.miniCarouselLabel}>{item.label}</span>
            </Link>
          ))}
        </HorizontalScrollTouchRail>
      </div>
    </div>
  );
}
