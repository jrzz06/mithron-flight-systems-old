"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MithronPageHeroImage } from "@/components/media/mithron-page-hero-image";
import { MithronThumbImage } from "@/components/media/mithron-thumb-image";
import { PatternBackground } from "@/components/ui/pattern-background";
import type { ProductMediaPlanItem } from "@/lib/product-detail-experience";
import { cn } from "@/lib/utils";
import styles from "./product-showcase.module.css";

const SWIPE_THRESHOLD = 48;

export function ProductImmersiveGallery({
  mediaPlan,
  showBadge = false,
  badgeLabel
}: {
  mediaPlan: ProductMediaPlanItem[];
  showBadge?: boolean;
  badgeLabel?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [failedSrcs, setFailedSrcs] = useState<Set<string>>(() => new Set());
  const [readySrcs, setReadySrcs] = useState<Set<string>>(() => new Set());
  const touchStartX = useRef<number | null>(null);

  const visibleSlides = mediaPlan.filter((slide) => !failedSrcs.has(slide.src));
  const safeIndex = visibleSlides.length ? Math.min(activeIndex, visibleSlides.length - 1) : 0;
  const activeMedia = visibleSlides[safeIndex] ?? visibleSlides[0];
  const hasMultiple = visibleSlides.length > 1;

  const goTo = useCallback((index: number) => {
    if (!visibleSlides.length) return;
    setActiveIndex((index + visibleSlides.length) % visibleSlides.length);
  }, [visibleSlides.length]);

  const markReady = useCallback((src: string) => {
    setReadySrcs((current) => {
      if (current.has(src)) return current;
      const next = new Set(current);
      next.add(src);
      return next;
    });
  }, []);

  const handleImageError = useCallback((src: string) => {
    setFailedSrcs((current) => new Set(current).add(src));
    setActiveIndex(0);
  }, []);

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  }, []);

  const handleTouchEnd = useCallback((event: React.TouchEvent) => {
    if (touchStartX.current === null || !hasMultiple) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    if (Math.abs(delta) >= SWIPE_THRESHOLD) {
      goTo(delta < 0 ? safeIndex + 1 : safeIndex - 1);
    }
    touchStartX.current = null;
  }, [goTo, hasMultiple, safeIndex]);

  useEffect(() => {
    if (!hasMultiple) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") goTo(safeIndex - 1);
      if (event.key === "ArrowRight") goTo(safeIndex + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goTo, hasMultiple, safeIndex]);

  useEffect(() => {
    const slide = visibleSlides[safeIndex];
    if (!slide) return;
    if (readySrcs.has(slide.src) || safeIndex === displayIndex) {
      setDisplayIndex(safeIndex);
    }
  }, [displayIndex, readySrcs, safeIndex, visibleSlides]);

  useLayoutEffect(() => {
    const slide = visibleSlides[safeIndex];
    if (!slide?.src || readySrcs.has(slide.src)) return;
    const image = new window.Image();
    image.decoding = "async";
    image.src = slide.src;
    if (image.complete && image.naturalWidth > 0) {
      markReady(slide.src);
      return;
    }
    image.onload = () => markReady(slide.src);
  }, [markReady, readySrcs, safeIndex, visibleSlides]);

  useEffect(() => {
    if (!hasMultiple) return;
    const preloadIndexes = [safeIndex - 1, safeIndex + 1]
      .map((index) => (index + visibleSlides.length) % visibleSlides.length);
    for (const index of preloadIndexes) {
      const slide = visibleSlides[index];
      if (!slide?.src || readySrcs.has(slide.src)) continue;
      const image = new window.Image();
      image.decoding = "async";
      image.src = slide.src;
      image.onload = () => markReady(slide.src);
    }
  }, [hasMultiple, markReady, readySrcs, safeIndex, visibleSlides]);

  if (!activeMedia) return null;

  const displayedMedia = visibleSlides[displayIndex] ?? activeMedia;
  const activeReady = readySrcs.has(activeMedia.src);
  const showSkeleton = !activeReady && !readySrcs.has(displayedMedia.src);

  return (
    <div className={styles.galleryCard}>
      <div className={styles.galleryShell}>
        <div className={cn(styles.galleryLayout, hasMultiple && styles.galleryLayoutWithThumbs)}>
        {hasMultiple ? (
          <div className={styles.thumbRail} role="tablist" aria-label="Product gallery">
            {visibleSlides.map((slide, index) => (
              <button
                key={slide.src}
                type="button"
                role="tab"
                aria-selected={safeIndex === index}
                aria-label={`View image ${index + 1}`}
                onClick={() => setActiveIndex(index)}
                className={cn(styles.thumbButton, safeIndex === index && styles.thumbButtonActive)}
              >
                <MithronThumbImage
                  src={slide.src}
                  alt=""
                  fill
                  responsive={slide.responsive}
                  className={styles.thumbImage}
                  sizes="64px"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        ) : null}

        <div
          className={styles.stage}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <PatternBackground
            showBadge={showBadge}
            badgeLabel={badgeLabel}
            className={styles.stagePattern}
          />
          <div className={styles.stageImageFrame}>
            <div className={styles.stageProductShadow} aria-hidden="true" />
            {visibleSlides.map((slide, index) => {
              const isDisplayed = index === displayIndex;
              const isTarget = index === safeIndex;
              const shouldRender =
                index === safeIndex
                || index === displayIndex
                || Math.abs(index - displayIndex) <= 1;
              if (!shouldRender) return null;
              return (
                <div
                  key={slide.src}
                  className={cn(
                    styles.stageLayer,
                    isDisplayed ? styles.stageLayerActive : styles.stageLayerHidden
                  )}
                  aria-hidden={!isDisplayed}
                >
                  <MithronPageHeroImage
                    src={slide.src}
                    alt={isDisplayed ? slide.alt : ""}
                    fill
                    responsive={slide.responsive}
                    useSourceImage={slide.src.includes("/catalog-cutouts/")}
                    onError={() => handleImageError(slide.src)}
                    onLoad={() => markReady(slide.src)}
                    className={styles.stageImage}
                    sizes="(min-width: 1024px) 58vw, 100vw"
                    priority={index === 0}
                    loading={index === 0 || isTarget ? "eager" : "lazy"}
                  />
                </div>
              );
            })}
          </div>

          {showSkeleton ? <div className={styles.stageSkeleton} aria-hidden="true" /> : null}

          {hasMultiple ? (
            <>
              <button type="button" aria-label="Previous image" onClick={() => goTo(safeIndex - 1)} className={cn(styles.galleryNav, styles.galleryNavPrev)}>
                <ChevronLeft className="size-5" />
              </button>
              <button type="button" aria-label="Next image" onClick={() => goTo(safeIndex + 1)} className={cn(styles.galleryNav, styles.galleryNavNext)}>
                <ChevronRight className="size-5" />
              </button>
              <p className={styles.galleryCounter}>{safeIndex + 1} / {visibleSlides.length}</p>
            </>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  );
}
