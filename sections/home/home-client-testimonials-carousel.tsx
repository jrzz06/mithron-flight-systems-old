"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  TestimonialCarouselCard,
  type TestimonialCarouselCardItem
} from "@/components/editorial/testimonial-carousel-card";
import { HorizontalScrollTouchRail } from "@/components/ui/horizontal-scroll-touch-rail";
import { useCssMarquee } from "@/hooks/use-css-marquee";
import { useReducedMotionPreference } from "@/hooks/use-reduced-motion";
import styles from "./home-client-testimonials-section.module.css";

export function renderAccentTitle(title: string, titleAccent: string) {
  const accent = titleAccent.trim();
  if (!accent) return { before: title, accent: "", after: "" };

  const index = title.indexOf(accent);
  if (index === -1) {
    return { before: title, accent: "", after: "" };
  }

  return {
    before: title.slice(0, index),
    accent,
    after: title.slice(index + accent.length)
  };
}

export function HomeClientTestimonialsCarousel({
  items,
  title,
  titleAccent,
  lead
}: {
  items: TestimonialCarouselCardItem[];
  title: string;
  titleAccent: string;
  lead: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotionPreference();
  const [marqueeReady, setMarqueeReady] = useState(false);
  const titleId = "home-client-testimonials-title";

  useEffect(() => {
    setMarqueeReady(true);
  }, []);

  const marqueeEnabled = marqueeReady && items.length > 1 && !reducedMotion;
  const loopItems = useMemo(
    () => (marqueeEnabled ? [...items, ...items] : items),
    [marqueeEnabled, items]
  );

  useCssMarquee({
    trackRef,
    viewportRef,
    itemCount: items.length,
    enabled: marqueeEnabled,
    reducedMotion,
    pausedClassName: styles.marqueePaused
  });

  const accentParts = renderAccentTitle(title, titleAccent);

  return (
    <div className={styles.inner}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <h2 id={titleId} className={styles.title}>
            {accentParts.before}
            {accentParts.accent ? <span className={styles.titleAccent}>{accentParts.accent}</span> : null}
            {accentParts.after}
          </h2>
          {lead ? <p className={styles.lead}>{lead}</p> : null}
        </div>
      </div>

      <div
        className={styles.carouselRegion}
        role="region"
        aria-roledescription="carousel"
        aria-labelledby={titleId}
        aria-live={marqueeEnabled ? "off" : undefined}
      >
        {marqueeEnabled ? (
          <div ref={viewportRef} className={styles.carouselViewport} data-testid="home-client-testimonials-viewport">
            <div
              ref={trackRef}
              className={styles.marqueeTrack}
              aria-label="Customer testimonials"
              data-testid="home-client-testimonials-track"
            >
              {loopItems.map((item, index) => (
                <div
                  key={`${item.id}-${index}`}
                  className={styles.cardSlot}
                  data-carousel-item
                  aria-hidden={index >= items.length ? true : undefined}
                >
                  <TestimonialCarouselCard item={item} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <HorizontalScrollTouchRail
            ref={trackRef}
            className={styles.track}
            aria-label="Customer testimonials"
            data-testid="home-client-testimonials-track"
          >
            {loopItems.map((item, index) => (
              <div key={`${item.id}-${index}`} className={styles.cardSlot} data-carousel-item>
                <TestimonialCarouselCard item={item} />
              </div>
            ))}
          </HorizontalScrollTouchRail>
        )}
      </div>
    </div>
  );
}
