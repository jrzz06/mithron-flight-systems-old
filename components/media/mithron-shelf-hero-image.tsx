
import type { CSSProperties } from "react";
import { MithronResponsiveImage } from "@/components/media/mithron-responsive-image";

type MithronShelfHeroImageProps = {
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
  className?: string;
  priority?: boolean;
};

export function MithronShelfHeroImage({
  src,
  alt,
  fill = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1536px) 100vw, 1536px",
  className,
  priority = false
}: MithronShelfHeroImageProps) {
  const backgroundStyle = undefined as CSSProperties | undefined;

  return (
    <MithronResponsiveImage
      src={src}
      alt={alt}
      fill={fill}
      sizes={sizes}
      imageRole="shelf"
      priority={priority}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={className}
      imageClassName="mithron-shelf-hero-image"
      style={backgroundStyle}
    />
  );
}
