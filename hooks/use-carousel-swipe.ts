"use client";

import { useCallback, useRef } from "react";

const DEFAULT_SWIPE_THRESHOLD = 48;

type CarouselSwipeOptions = {
  enabled?: boolean;
  threshold?: number;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
};

export function useCarouselSwipe({
  enabled = true,
  threshold = DEFAULT_SWIPE_THRESHOLD,
  onSwipeLeft,
  onSwipeRight,
  onInteractionStart,
  onInteractionEnd
}: CarouselSwipeOptions) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeRef = useRef(false);

  const onTouchStart = useCallback(
    (event: React.TouchEvent<HTMLElement>) => {
      if (!enabled) return;
      const touch = event.touches[0];
      if (!touch) return;
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      swipeRef.current = false;
      onInteractionStart?.();
    },
    [enabled, onInteractionStart]
  );

  const onTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLElement>) => {
      if (!enabled) {
        onInteractionEnd?.();
        return;
      }

      const start = touchStartRef.current;
      const endTouch = event.changedTouches[0];
      touchStartRef.current = null;

      if (!start || !endTouch) {
        onInteractionEnd?.();
        return;
      }

      const deltaX = endTouch.clientX - start.x;
      const deltaY = endTouch.clientY - start.y;

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) >= threshold) {
        swipeRef.current = true;
        if (deltaX < 0) {
          onSwipeLeft();
        } else {
          onSwipeRight();
        }
      }

      window.setTimeout(() => {
        swipeRef.current = false;
      }, 80);

      onInteractionEnd?.();
    },
    [enabled, onInteractionEnd, onSwipeLeft, onSwipeRight, threshold]
  );

  const onClickCapture = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!swipeRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    onTouchStart,
    onTouchEnd,
    onTouchCancel: onTouchEnd,
    onClickCapture
  };
}
