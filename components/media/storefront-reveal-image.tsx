"use client";

import { useEffect, useRef, type ImgHTMLAttributes } from "react";
import { useImageReveal } from "@/hooks/use-image-reveal";
import { cn } from "@/lib/utils";

type StorefrontRevealImageProps = ImgHTMLAttributes<HTMLImageElement>;

export function StorefrontRevealImage({
  className,
  onLoad,
  ...props
}: StorefrontRevealImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const { isRevealed, revealFromImage, handleReveal } = useImageReveal(String(props.src ?? ""));

  useEffect(() => {
    revealFromImage(imgRef.current);
  }, [props.src, revealFromImage]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={props.alt ?? ""}
      ref={imgRef}
      className={cn("mithron-responsive-image", isRevealed && "is-revealed", className)}
      data-image-reveal={isRevealed ? "revealed" : "pending"}
      onLoad={(event) => {
        handleReveal();
        onLoad?.(event);
      }}
    />
  );
}
