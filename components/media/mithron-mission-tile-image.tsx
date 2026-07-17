
import type { CSSProperties, ImgHTMLAttributes } from "react";
import { MithronResponsiveImage } from "@/components/media/mithron-responsive-image";
import { missionTileMaxWidths, type MissionTileCardType } from "@/config/media-delivery-profiles";
import { getStorefrontResponsiveAsset } from "@/lib/media/resolve-storefront-src";

type MithronMissionTileImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "loading"> & {
  src: string;
  alt: string;
  cardType: MissionTileCardType;
  sizes: string;
  wrapperClassName?: string;
  className?: string;
  style?: CSSProperties;
};

export function MithronMissionTileImage({
  src,
  alt,
  cardType,
  sizes,
  wrapperClassName,
  className,
  style
}: MithronMissionTileImageProps) {
  const responsive = getStorefrontResponsiveAsset(src);

  return (
    <MithronResponsiveImage
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      preferredFormat="webp"
      maxVariantWidth={missionTileMaxWidths[cardType]}
      responsive={responsive}
      webpOnly
      loading="lazy"
      decoding="async"
      wrapperClassName={wrapperClassName}
      className={className}
      style={style}
    />
  );
}
