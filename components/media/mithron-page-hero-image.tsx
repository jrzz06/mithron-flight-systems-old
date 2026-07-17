
import type { CSSProperties, ImgHTMLAttributes } from "react";
import { MithronResponsiveImage } from "@/components/media/mithron-responsive-image";
import type { ResponsiveMediaAsset } from "@/config/types";

type MithronPageHeroImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  src: string;
  alt: string;
  sizes?: string;
  fill?: boolean;
  priority?: boolean;
  responsive?: ResponsiveMediaAsset;
  useSourceImage?: boolean;
  className?: string;
  wrapperClassName?: string;
  style?: CSSProperties;
  loading?: "eager" | "lazy";
};

export function MithronPageHeroImage({
  src,
  alt,
  sizes = "100vw",
  fill = true,
  priority = false,
  responsive,
  useSourceImage,
  className,
  wrapperClassName,
  style,
  loading,
  onLoad,
  onError,
  ...props
}: MithronPageHeroImageProps) {
  return (
    <MithronResponsiveImage
      src={src}
      alt={alt}
      fill={fill}
      sizes={sizes}
      imageRole="hero"
      priority={priority}
      responsive={responsive}
      useSourceImage={useSourceImage}
      loading={loading ?? (priority ? "eager" : "lazy")}
      className={className}
      wrapperClassName={wrapperClassName}
      style={style}
      onLoad={onLoad}
      onError={onError}
      {...props}
    />
  );
}
