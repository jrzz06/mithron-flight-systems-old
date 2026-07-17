
import type { CSSProperties, ImgHTMLAttributes } from "react";
import { MithronResponsiveImage } from "@/components/media/mithron-responsive-image";
import type { ResponsiveMediaAsset } from "@/config/types";
import { getStorefrontResponsiveAsset } from "@/lib/media/resolve-storefront-src";

type MithronThumbImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "loading"> & {
  src: string;
  alt: string;
  sizes?: string;
  fill?: boolean;
  responsive?: ResponsiveMediaAsset;
  className?: string;
  wrapperClassName?: string;
  style?: CSSProperties;
  loading?: "eager" | "lazy";
  priority?: boolean;
};

export function MithronThumbImage({
  src,
  alt,
  sizes = "80px",
  fill = true,
  responsive,
  className,
  wrapperClassName,
  style,
  loading = "lazy",
  priority = false
}: MithronThumbImageProps) {
  const resolvedResponsive = responsive ?? getStorefrontResponsiveAsset(src);

  return (
    <MithronResponsiveImage
      src={src}
      alt={alt}
      fill={fill}
      sizes={sizes}
      imageRole="thumb"
      responsive={resolvedResponsive}
      loading={loading}
      priority={priority}
      decoding="async"
      className={className}
      wrapperClassName={wrapperClassName}
      style={style}
    />
  );
}
