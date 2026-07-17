"use client";

import { useEffect, type RefObject } from "react";

const DEFAULT_SPEED_PX_PER_SEC = 48;
const ITEM_SELECTOR = "[data-carousel-item]";

type UseCssMarqueeOptions = {
  trackRef: RefObject<HTMLElement | null>;
  viewportRef: RefObject<HTMLElement | null>;
  itemCount: number;
  enabled?: boolean;
  reducedMotion?: boolean;
  speedPxPerSec?: number;
  pausedClassName?: string;
};

export function measureMarqueeLoopDistance(track: HTMLElement, itemCount: number) {
  if (itemCount <= 0) return 0;

  const items = track.querySelectorAll<HTMLElement>(ITEM_SELECTOR);
  const loopStart = items[itemCount];
  if (loopStart) {
    const distance = loopStart.offsetLeft;
    if (distance > 0) return distance;
  }

  const halfWidth = track.scrollWidth / 2;
  return halfWidth > 0 ? halfWidth : 0;
}

function restartMarqueeAnimation(track: HTMLElement) {
  track.style.animation = "none";
  void track.offsetHeight;
  track.style.removeProperty("animation");
}

function applyMarqueeDuration(track: HTMLElement, loopDistance: number, speedPxPerSec: number) {
  if (loopDistance <= 0) return;

  track.style.setProperty("--marquee-duration", `${loopDistance / speedPxPerSec}s`);
  restartMarqueeAnimation(track);
}

export function useCssMarquee({
  trackRef,
  viewportRef,
  itemCount,
  enabled = true,
  reducedMotion = false,
  speedPxPerSec = DEFAULT_SPEED_PX_PER_SEC,
  pausedClassName = "marqueePaused"
}: UseCssMarqueeOptions) {
  useEffect(() => {
    if (!enabled || reducedMotion || itemCount <= 1) return;

    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track) return;

    let measureTimer: ReturnType<typeof setTimeout> | null = null;

    const measure = () => {
      const node = trackRef.current;
      if (!node) return;
      applyMarqueeDuration(node, measureMarqueeLoopDistance(node, itemCount), speedPxPerSec);
    };

    const scheduleMeasure = () => {
      if (measureTimer !== null) clearTimeout(measureTimer);
      measureTimer = setTimeout(measure, 50);
    };

    let offscreenPaused = false;
    let tabHiddenPaused = false;

    const syncPauseState = () => {
      const paused = offscreenPaused || tabHiddenPaused;
      track.classList.toggle(pausedClassName, paused);
    };

    const setOffscreenPaused = (paused: boolean) => {
      offscreenPaused = paused;
      syncPauseState();
    };

    const onVisibilityChange = () => {
      if (typeof document === "undefined") return;
      tabHiddenPaused = document.visibilityState !== "visible";
      syncPauseState();
    };

    measure();
    scheduleMeasure();

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(track);
    if (viewport) resizeObserver.observe(viewport);

    const onImageLoad = (event: Event) => {
      if (!(event.target instanceof HTMLImageElement)) return;
      if (!track.contains(event.target)) return;
      scheduleMeasure();
    };

    track.addEventListener("load", onImageLoad, true);

    document.addEventListener("visibilitychange", onVisibilityChange);

    let intersectionObserver: IntersectionObserver | undefined;
    if (viewport && typeof IntersectionObserver !== "undefined") {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          setOffscreenPaused(!entries.some((entry) => entry.isIntersecting));
        },
        { threshold: 0.01 }
      );
      intersectionObserver.observe(viewport);
    }

    onVisibilityChange();

    return () => {
      if (measureTimer !== null) clearTimeout(measureTimer);
      resizeObserver.disconnect();
      track.removeEventListener("load", onImageLoad, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      intersectionObserver?.disconnect();
      track.classList.remove(pausedClassName);
    };
  }, [enabled, itemCount, pausedClassName, reducedMotion, speedPxPerSec, trackRef, viewportRef]);
}

/** @deprecated Use measureMarqueeLoopDistance instead */
export const measureMarqueeDistance = measureMarqueeLoopDistance;
