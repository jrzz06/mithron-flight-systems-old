"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { MithronCardImage } from "@/components/media/mithron-card-image";
import {
  buildCatalogCardImageCandidates,
  type ProductCardImageSource
} from "@/lib/media/catalog-card-image";
import { cn } from "@/lib/utils";

export type ProductCardImageProps = {
  product: ProductCardImageSource;
  className?: string;
  placeholderClassName?: string;
  sizes: string;
  priority?: boolean;
  fill?: boolean;
  decorative?: boolean;
  style?: CSSProperties;
};

export function ProductCardImage({
  product,
  className,
  placeholderClassName,
  sizes,
  priority = false,
  fill = true,
  decorative = false,
  style
}: ProductCardImageProps) {
  const candidates = useMemo(() => buildCatalogCardImageCandidates(product), [product]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const current = candidates[candidateIndex];

  if (!current || candidateIndex >= candidates.length) {
    return (
      <span
        aria-hidden="true"
        data-mithron-image-fallback="catalog-placeholder"
        className={cn("absolute inset-0 block", placeholderClassName)}
        style={style}
      />
    );
  }

  return (
    <MithronCardImage
      key={current.src}
      src={current.src}
      alt={decorative ? "" : current.alt}
      aria-hidden={decorative ? true : undefined}
      fill={fill}
      priority={priority}
      responsive={current.responsive}
      useSourceImage={current.useSourceImage}
      sizes={sizes}
      className={className}
      style={style}
      onError={() => setCandidateIndex((index) => index + 1)}
    />
  );
}
