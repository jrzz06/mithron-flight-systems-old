"use client";

import { useEffect, useMemo, useRef, useState, type ImgHTMLAttributes, type SyntheticEvent } from "react";
import type { ResponsiveImageModel } from "@/lib/media/responsive-image-model";
import { buildImageFallbackChain, isResponsiveVariantSrc } from "@/lib/media/responsive-image-model";
import { pickResponsiveWidth } from "@/lib/media/responsive-image-utils";
import { reportImageRenderMetrics } from "@/lib/media/debug-image-metrics";
import { useImageReveal } from "@/hooks/use-image-reveal";
import { cn } from "@/lib/utils";

type MithronResponsiveImageImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "loading"> & {
  model: ResponsiveImageModel;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  loading?: "eager" | "lazy";
  imageClassName?: string;
  onFallbackActivate?: (active: boolean) => void;
};

function isRemoteImageSrc(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}

export function MithronResponsiveImageImg({
  model,
  alt,
  fill = false,
  priority = false,
  loading,
  className,
  imageClassName,
  style,
  width: widthProp,
  height: heightProp,
  onError: onErrorProp,
  onLoad: onLoadProp,
  onFallbackActivate,
  ...props
}: MithronResponsiveImageImgProps) {
  const fallbackChain = useMemo(() => buildImageFallbackChain(model), [model]);
  const chainKey = `${model.primarySrc}::${model.requestedSrc}`;
  const [fallbackByKey, setFallbackByKey] = useState<Record<string, number>>({});
  const fallbackIndex = fallbackByKey[chainKey] ?? 0;
  const imgRef = useRef<HTMLImageElement>(null);
  const imageSrc = fallbackChain[fallbackIndex] ?? model.primarySrc;
  if (!imageSrc?.trim()) {
    return null;
  }
  const usesPlainDelivery = !isResponsiveVariantSrc(model, imageSrc);
  const useDirectDelivery = model.useSourceImage || model.useNativeRemoteImage || (usesPlainDelivery && isRemoteImageSrc(imageSrc));
  const resolvedLoading = priority ? "eager" : loading ?? "lazy";
  const width = widthProp ?? model.width;
  const height = heightProp ?? model.height;
  const { isRevealed, revealFromImage, handleReveal } = useImageReveal(imageSrc);

  useEffect(() => {
    onFallbackActivate?.(usesPlainDelivery);
  }, [usesPlainDelivery, onFallbackActivate]);

  useEffect(() => {
    revealFromImage(imgRef.current);
  }, [imageSrc, revealFromImage]);

  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const nextIndex = fallbackIndex + 1;
    if (nextIndex < fallbackChain.length && process.env.VITEST !== "true") {
      setFallbackByKey((current) => ({ ...current, [chainKey]: nextIndex }));
      return;
    }

    onErrorProp?.(event);
    handleReveal();
  };

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    handleReveal();
    onLoadProp?.(event);
    const img = event.currentTarget;
    reportImageRenderMetrics(img, {
      component: "MithronResponsiveImage",
      hypothesisId: "A-B-E",
      requestedSrc: model.requestedSrc,
      deliveredSrc: imageSrc,
      sizes: model.resolvedSizes,
      srcSet: usesPlainDelivery ? undefined : model.avifSrcSet || model.webpSrcSet || model.pngSrcSet,
      assetStatus: model.responsive?.status,
      assetId: model.responsive?.assetId,
      maxVariantWidth: model.deliveredMaxVariantWidth || undefined
    });
  };

  return (
    // Responsive delivery intentionally uses native img for srcset/fallback control.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      key={imageSrc}
      ref={imgRef}
      src={imageSrc}
      alt={alt}
      width={fill ? undefined : (useDirectDelivery ? pickResponsiveWidth(width, fill) : width)}
      height={fill ? undefined : (useDirectDelivery ? (typeof height === "number" ? Math.min(height, 1280) : 512) : height)}
      loading={resolvedLoading}
      fetchPriority={priority ? "high" : "auto"}
      decoding={priority ? "sync" : "async"}
      sizes={usesPlainDelivery ? undefined : model.resolvedSizes}
      className={cn(
        useDirectDelivery ? "mithron-responsive-image object-cover" : "mithron-responsive-image",
        fill && "absolute inset-0 h-full w-full object-cover",
        isRevealed && "is-revealed",
        className,
        imageClassName
      )}
      data-image-reveal={isRevealed ? "revealed" : "pending"}
      data-image-fallback={usesPlainDelivery ? "plain" : "responsive"}
      style={style}
      onError={handleImageError}
      onLoad={handleImageLoad}
    />
  );
}
