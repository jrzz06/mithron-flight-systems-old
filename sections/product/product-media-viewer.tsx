"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MediaAsset, ProductHotspot } from "@/config/types";
import { MithronPageHeroImage } from "@/components/media/mithron-page-hero-image";
import { MithronThumbImage } from "@/components/media/mithron-thumb-image";
import { glassPillClassName } from "@/lib/glass-ui";
import { cn } from "@/lib/utils";
import styles from "./product-detail.module.css";

export type ProductMediaViewerModel = {
  image: MediaAsset;
  hero: MediaAsset;
  gallery: MediaAsset[];
  hotspots?: ProductHotspot[];
};

function uniqueMediaAssets(items: MediaAsset[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.src)) return false;
    seen.add(item.src);
    return true;
  });
}

function mediaReliabilityScore(src: string) {
  if (src.includes("/storage/v1/object/public/")) return 3;
  if (src.startsWith("/")) return 2;
  return 1;
}

function sortMediaAssets(items: MediaAsset[]) {
  return [...items].sort((left, right) => mediaReliabilityScore(right.src) - mediaReliabilityScore(left.src));
}

export function ProductMediaViewer({ product }: { product: ProductMediaViewerModel }) {
  const slides = useMemo(
    () => sortMediaAssets(uniqueMediaAssets([product.hero, product.image, ...product.gallery])),
    [product.gallery, product.hero, product.image]
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedSrcs, setFailedSrcs] = useState<Set<string>>(() => new Set());
  const [activeHotspot, setActiveHotspot] = useState<string | null>(product.hotspots?.[0]?.id ?? null);

  const visibleSlides = useMemo(
    () => slides.filter((slide) => !failedSrcs.has(slide.src)),
    [failedSrcs, slides]
  );
  const safeActiveIndex =
    visibleSlides.length === 0 ? 0 : Math.min(activeIndex, visibleSlides.length - 1);
  const activeMedia =
    visibleSlides[safeActiveIndex] ?? visibleSlides[0] ?? product.hero ?? product.image;
  const selectedHotspot = product.hotspots?.find((hotspot) => hotspot.id === activeHotspot);
  const hasMultipleSlides = visibleSlides.length > 1;

  const goTo = useCallback((index: number) => {
    if (!visibleSlides.length) return;
    setActiveIndex((index + visibleSlides.length) % visibleSlides.length);
  }, [visibleSlides.length]);

  const handleImageError = useCallback(() => {
    const failedSrc = activeMedia?.src;
    if (!failedSrc) return;

    setFailedSrcs((current) => {
      const next = new Set(current);
      next.add(failedSrc);
      return next;
    });
    setActiveIndex(0);
  }, [activeMedia.src]);

  useEffect(() => {
    if (!hasMultipleSlides) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") goTo(safeActiveIndex - 1);
      if (event.key === "ArrowRight") goTo(safeActiveIndex + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [safeActiveIndex, goTo, hasMultipleSlides]);

  return (
    <div className={cn("product-media-viewer", styles.mediaViewer)} data-media-viewer="mithron-native-assets">
      <div
        className={cn(
          styles.mediaViewerInner,
          hasMultipleSlides && styles.mediaViewerInnerWithThumbs
        )}
      >
        {hasMultipleSlides ? (
          <div className={styles.thumbRail} role="tablist" aria-label="Product images">
            {visibleSlides.map((slide, index) => (
              <button
                key={slide.src}
                type="button"
                role="tab"
                aria-selected={safeActiveIndex === index}
                aria-label={`View image ${index + 1} of ${visibleSlides.length}`}
                onClick={() => setActiveIndex(index)}
                className={cn(
                  styles.mediaThumb,
                  safeActiveIndex === index && styles.mediaThumbActive
                )}
              >
                <MithronThumbImage
                  src={slide.src}
                  alt=""
                  fill
                  responsive={slide.responsive}
                  className="object-contain p-1.5"
                  sizes="88px"
                />
              </button>
            ))}
          </div>
        ) : null}

        <div className={styles.mediaStageWrap}>
          <div className={styles.mediaStage}>
            <div className={styles.mediaGroundShadow} aria-hidden="true" />
            <div className={styles.mediaImageFrame}>
              <MithronPageHeroImage
                src={activeMedia.src}
                alt={activeMedia.alt}
                fill
                responsive={activeMedia.responsive}
                onError={handleImageError}
                className={styles.mediaImage}
                sizes="(min-width: 1024px) 55vw, 100vw"
              />
            </div>

            {product.hotspots?.map((hotspot) => (
              <button
                key={hotspot.id}
                type="button"
                data-testid={`product-hotspot-${hotspot.id}-desktop`}
                aria-label={hotspot.label}
                aria-pressed={activeHotspot === hotspot.id}
                onClick={() => setActiveHotspot(hotspot.id)}
                className={cn(
                  "type-button absolute z-30 hidden min-h-11 -translate-x-1/2 -translate-y-1/2 rounded-full border px-4 py-2 text-xs shadow-md transition-colors md:inline-flex",
                  activeHotspot === hotspot.id
                    ? glassPillClassName("border-white/40 shadow-lg")
                    : "border-white/70 bg-[var(--brand-accent)]/90 text-white"
                )}
                style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
              >
                {hotspot.label}
              </button>
            ))}

            {selectedHotspot ? (
              <div className={styles.hotspotDetail}>
                <p className="type-card-title text-sm text-[#000000]">{selectedHotspot.label}</p>
                <p className="type-body mt-1 line-clamp-3 text-xs leading-relaxed text-[#4B5563]">{selectedHotspot.detail}</p>
              </div>
            ) : null}

            {hasMultipleSlides ? (
              <>
                <button
                  type="button"
                  aria-label="Previous image"
                  onClick={() => goTo(safeActiveIndex - 1)}
                  className={cn(styles.galleryNav, styles.galleryNavPrev)}
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  onClick={() => goTo(safeActiveIndex + 1)}
                  className={cn(styles.galleryNav, styles.galleryNavNext)}
                >
                  <ChevronRight className="size-5" />
                </button>
                <p className={cn("type-meta", styles.galleryCounter)}>
                  {safeActiveIndex + 1} / {visibleSlides.length}
                </p>
              </>
            ) : null}
          </div>

          {product.hotspots?.length ? (
            <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto md:hidden">
              {product.hotspots.map((hotspot) => (
                <button
                  key={hotspot.id}
                  type="button"
                  data-testid={`product-hotspot-${hotspot.id}-mobile`}
                  aria-label={hotspot.label}
                  aria-pressed={activeHotspot === hotspot.id}
                  onClick={() => setActiveHotspot(hotspot.id)}
                  className={cn(
                    "type-button min-h-11 min-w-max rounded-full border px-4 py-2 text-xs transition-colors",
                    activeHotspot === hotspot.id
                      ? glassPillClassName("shadow-md")
                      : "border-[#E5E7EB] bg-white text-[#000000]"
                  )}
                >
                  {hotspot.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
