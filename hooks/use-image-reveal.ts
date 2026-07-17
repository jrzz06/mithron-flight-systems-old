"use client";

import { useCallback, useState } from "react";

export function useImageReveal(src: string) {
  const [revealedSrc, setRevealedSrc] = useState<string | null>(null);
  const isRevealed = revealedSrc === src;

  const revealFromImage = useCallback((img: HTMLImageElement | null) => {
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) {
      setRevealedSrc(src);
    }
  }, [src]);

  const handleReveal = useCallback(() => {
    setRevealedSrc(src);
  }, [src]);

  return { isRevealed, revealFromImage, handleReveal };
}
