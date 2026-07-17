"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const DEFAULT_AUTO_PLAY_INTERVAL_MS = 5000;

type UseScrollCarouselOptions = {
  itemCount: number;
  scrollRef: RefObject<HTMLElement | null>;
  reducedMotion?: boolean;
  autoPlay?: boolean;
  autoPlayIntervalMs?: number;
  loop?: boolean;
  isPaused?: boolean;
};

function measureStep(container: HTMLElement) {
  const firstItem = container.querySelector<HTMLElement>("[data-carousel-item]");
  if (!firstItem) return container.clientWidth;

  const styles = getComputedStyle(container);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
  return firstItem.offsetWidth + gap;
}

export function useScrollCarousel({
  itemCount,
  scrollRef,
  reducedMotion = false,
  autoPlay = false,
  autoPlayIntervalMs = DEFAULT_AUTO_PLAY_INTERVAL_MS,
  loop = false,
  isPaused = false
}: UseScrollCarouselOptions) {
  const [activeIndex, setActiveIndex] = useState(0);
  const rafRef = useRef<number | null>(null);
  const activeIndexRef = useRef(0);

  activeIndexRef.current = activeIndex;

  const syncActiveIndex = useCallback(() => {
    const container = scrollRef.current;
    if (!container || itemCount <= 0) return;

    const step = measureStep(container);
    if (step <= 0) return;

    const nextIndex = Math.max(0, Math.min(itemCount - 1, Math.round(container.scrollLeft / step)));
    setActiveIndex((current) => (current === nextIndex ? current : nextIndex));
  }, [itemCount, scrollRef]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const container = scrollRef.current;
      if (!container || itemCount <= 0) return;

      const clamped = Math.max(0, Math.min(itemCount - 1, index));
      const step = measureStep(container);
      container.scrollTo({
        left: step * clamped,
        behavior: reducedMotion ? "auto" : "smooth"
      });
      setActiveIndex(clamped);
    },
    [itemCount, reducedMotion, scrollRef]
  );

  const scrollPrev = useCallback(() => {
    const current = activeIndexRef.current;
    if (current <= 0) {
      if (loop && itemCount > 1) {
        scrollToIndex(itemCount - 1);
      }
      return;
    }
    scrollToIndex(current - 1);
  }, [itemCount, loop, scrollToIndex]);

  const scrollNext = useCallback(() => {
    const current = activeIndexRef.current;
    if (current >= itemCount - 1) {
      if (loop && itemCount > 1) {
        scrollToIndex(0);
      }
      return;
    }
    scrollToIndex(current + 1);
  }, [itemCount, loop, scrollToIndex]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const onScroll = () => {
      if (rafRef.current !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        syncActiveIndex();
        rafRef.current = null;
      });
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(onScroll);
    observer.observe(container);

    onScroll();

    return () => {
      container.removeEventListener("scroll", onScroll);
      observer.disconnect();
      if (rafRef.current !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [scrollRef, syncActiveIndex]);

  useEffect(() => {
    if (activeIndex >= itemCount && itemCount > 0) {
      setActiveIndex(itemCount - 1);
    }
  }, [activeIndex, itemCount]);

  useEffect(() => {
    if (!autoPlay || reducedMotion || isPaused || itemCount <= 1) return;

    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      scrollNext();
    }, autoPlayIntervalMs);

    return () => clearInterval(timer);
  }, [autoPlay, autoPlayIntervalMs, isPaused, itemCount, reducedMotion, scrollNext]);

  return {
    activeIndex,
    scrollToIndex,
    scrollPrev,
    scrollNext,
    canScrollPrev: loop ? itemCount > 1 : activeIndex > 0,
    canScrollNext: loop ? itemCount > 1 : activeIndex < Math.max(0, itemCount - 1)
  };
}
