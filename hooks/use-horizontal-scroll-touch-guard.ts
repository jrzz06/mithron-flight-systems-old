"use client";

import { useCallback, useRef } from "react";

type TouchPoint = {
  x: number;
  y: number;
  swiped: boolean;
};

export function useHorizontalScrollTouchGuard() {
  const touchRef = useRef<TouchPoint>({ x: 0, y: 0, swiped: false });

  const onTouchStart = useCallback((event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchRef.current = { x: touch.clientX, y: touch.clientY, swiped: false };
  }, []);

  const onTouchMove = useCallback((event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchRef.current.x;
    const deltaY = touch.clientY - touchRef.current.y;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8) {
      touchRef.current.swiped = true;
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    window.setTimeout(() => {
      touchRef.current.swiped = false;
    }, 80);
  }, []);

  const onClickCapture = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!touchRef.current.swiped) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: onTouchEnd,
    onClickCapture
  };
}
