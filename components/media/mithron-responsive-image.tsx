"use client";

import { useCallback, useState, type CSSProperties, type ImgHTMLAttributes } from "react";
import { getMediaDeliveryProfile, type MediaDeliveryRole } from "@/config/media-delivery-profiles";
import type { ResponsiveMediaAsset } from "@/config/types";
import { MithronResponsiveImageImg } from "@/components/media/mithron-responsive-image-img";
import { buildResponsiveImageModel } from "@/lib/media/responsive-image-model";
import { cn } from "@/lib/utils";

type MithronResponsiveImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "loading"> & {
  src: string;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  loading?: "eager" | "lazy";
  sizes?: string;
  imageRole?: MediaDeliveryRole;
  preferredFormat?: "avif" | "webp" | "png";
  maxVariantWidth?: number;
  webpOnly?: boolean;
  responsive?: ResponsiveMediaAsset;
  useSourceImage?: boolean;
  wrapperClassName?: string;
  imageClassName?: string;
};

export function MithronResponsiveImage({
  src,
  alt,
  fill = false,
  priority = false,
  loading,
  sizes,
  imageRole,
  preferredFormat: preferredFormatProp,
  maxVariantWidth: maxVariantWidthProp,
  webpOnly: webpOnlyProp,
  responsive: responsiveOverride,
  useSourceImage = false,
  className,
  wrapperClassName,
  imageClassName,
  style,
  width: widthProp,
  height: heightProp,
  onError,
  onLoad,
  ...props
}: MithronResponsiveImageProps) {
  const [plainFallbackActive, setPlainFallbackActive] = useState(false);
  const handleFallbackActivate = useCallback((active: boolean) => {
    setPlainFallbackActive(active);
  }, []);

  const profile = imageRole ? getMediaDeliveryProfile(imageRole) : undefined;
  const normalizedSrc = src?.trim() ?? "";
  if (!normalizedSrc) {
    return (
      <span
        aria-hidden="true"
        data-mithron-image-fallback="missing"
        className={cn("mithron-responsive-image-frame", fill ? "absolute inset-0 block" : "block", wrapperClassName)}
        style={style}
      />
    );
  }

  const model = buildResponsiveImageModel({
    src: normalizedSrc,
    imageRole,
    preferredFormat: preferredFormatProp ?? profile?.preferredFormat,
    maxVariantWidth: maxVariantWidthProp ?? profile?.maxVariantWidth,
    webpOnly: webpOnlyProp ?? profile?.webpOnly,
    responsive: responsiveOverride,
    useSourceImage,
    fill,
    width: widthProp,
    height: heightProp,
    sizes
  });

  const backgroundStyle = model.backgroundStyle as CSSProperties;
  const usePlainPicture = model.mode === "source" || model.mode === "remote" || plainFallbackActive;
  const imageProps = {
    ...props,
    model,
    alt,
    fill,
    priority,
    loading,
    className,
    imageClassName,
    style,
    width: widthProp,
    height: heightProp,
    onError,
    onLoad,
    onFallbackActivate: handleFallbackActivate
  };

  if (usePlainPicture) {
    return (
      <picture
        data-mithron-asset-id={model.assetId}
        data-mithron-asset-status={model.assetStatus}
        data-mithron-asset-bucket={model.assetBucket}
        data-mithron-image-fallback={plainFallbackActive ? "plain" : "native"}
        className={cn("mithron-responsive-image-frame", fill ? "absolute inset-0 block" : "block", wrapperClassName)}
        style={backgroundStyle}
      >
        <MithronResponsiveImageImg {...imageProps} />
      </picture>
    );
  }

  return (
    <picture
      data-mithron-asset-id={model.assetId}
      data-mithron-asset-status={model.assetStatus}
      data-mithron-asset-bucket={model.assetBucket}
      data-blur-placeholder={model.blurPlaceholder ? "true" : "false"}
      className={cn("mithron-responsive-image-frame", fill ? "absolute inset-0 block" : "block", wrapperClassName)}
      style={backgroundStyle}
    >
      {model.avifSrcSet ? <source type="image/avif" srcSet={model.avifSrcSet} sizes={model.resolvedSizes} /> : null}
      {model.webpSrcSet ? <source type="image/webp" srcSet={model.webpSrcSet} sizes={model.resolvedSizes} /> : null}
      {model.pngSrcSet ? <source type="image/png" srcSet={model.pngSrcSet} sizes={model.resolvedSizes} /> : null}
      <MithronResponsiveImageImg {...imageProps} />
    </picture>
  );
}
