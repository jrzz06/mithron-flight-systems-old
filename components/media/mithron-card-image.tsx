
import type { CSSProperties, ImgHTMLAttributes } from "react";
import { MithronResponsiveImage } from "@/components/media/mithron-responsive-image";
import type { ResponsiveMediaAsset } from "@/config/types";

type MithronCardImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "loading"> & {
  src: string;
  alt: string;
  sizes: string;
  fill?: boolean;
  priority?: boolean;
  responsive?: ResponsiveMediaAsset;
  useSourceImage?: boolean;
  className?: string;
  wrapperClassName?: string;
  style?: CSSProperties;
  width?: number;
  height?: number;
};

export function MithronCardImage({
  src,
  alt,
  sizes,
  fill = true,
  priority = false,
  responsive,
  useSourceImage = false,
  className,
  wrapperClassName,
  style,
  width,
  height,
  ...props
}: MithronCardImageProps) {
  return (
    <MithronResponsiveImage
      src={src}
      alt={alt}
      fill={fill}
      sizes={sizes}
      imageRole="card"
      priority={priority}
      responsive={responsive}
      useSourceImage={useSourceImage}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={className}
      wrapperClassName={wrapperClassName}
      style={style}
      width={width}
      height={height}
      {...props}
    />
  );
}
