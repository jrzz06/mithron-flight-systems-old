type ImageDebugMeta = {
  component: "MithronResponsiveImage" | "MithronShelfHeroImage";
  hypothesisId: string;
  requestedSrc: string;
  deliveredSrc: string;
  sizes?: string;
  srcSet?: string;
  assetStatus?: string;
  assetId?: string;
  maxVariantWidth?: number;
  sectionContext?: string;
};

export function reportImageRenderMetrics(img: HTMLImageElement, meta: ImageDebugMeta) {
  if (process.env.NODE_ENV === "production") return;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;
  const clientWidth = img.clientWidth;
  const clientHeight = img.clientHeight;
  const physicalWidthNeeded = Math.round(clientWidth * dpr);
  const physicalHeightNeeded = Math.round(clientHeight * dpr);
  const widthUpscaleRatio = naturalWidth > 0 ? physicalWidthNeeded / naturalWidth : 0;
  const heightUpscaleRatio = naturalHeight > 0 ? physicalHeightNeeded / naturalHeight : 0;
  const maxUpscaleRatio = Math.max(widthUpscaleRatio, heightUpscaleRatio);
  const computedStyle = window.getComputedStyle(img);
  const sectionContext =
    meta.sectionContext ??
    img.closest("[data-testid]")?.getAttribute("data-testid") ??
    img.closest("[data-home-composite-chapter]")?.getAttribute("data-home-composite-chapter") ??
    img.closest("#hero")?.id ??
    "unknown";

  // #region agent log
  fetch("http://127.0.0.1:7692/ingest/14258eeb-da8a-458a-9c6f-67527810425a", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "7bdaad" },
    body: JSON.stringify({
      sessionId: "7bdaad",
      runId: "pre-fix",
      hypothesisId: meta.hypothesisId,
      location: "lib/media/debug-image-metrics.ts:reportImageRenderMetrics",
      message: "image render metrics",
      data: {
        component: meta.component,
        sectionContext,
        requestedSrc: meta.requestedSrc,
        deliveredSrc: meta.deliveredSrc,
        currentSrc: img.currentSrc,
        sizes: meta.sizes,
        srcSet: meta.srcSet,
        assetStatus: meta.assetStatus,
        assetId: meta.assetId,
        maxVariantWidth: meta.maxVariantWidth,
        devicePixelRatio: dpr,
        naturalWidth,
        naturalHeight,
        clientWidth,
        clientHeight,
        physicalWidthNeeded,
        physicalHeightNeeded,
        widthUpscaleRatio: Number(widthUpscaleRatio.toFixed(3)),
        heightUpscaleRatio: Number(heightUpscaleRatio.toFixed(3)),
        maxUpscaleRatio: Number(maxUpscaleRatio.toFixed(3)),
        isUpscaled: maxUpscaleRatio > 1.05,
        cssTransform: computedStyle.transform,
        cssFilter: computedStyle.filter,
        cssObjectFit: computedStyle.objectFit
      },
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion
}
