"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { ImageIcon, Monitor, Smartphone, Tablet, Upload } from "lucide-react";
import type { CmsImageSpec } from "@/config/homepage-section-registry";
import { validateImageFile } from "@/lib/cms/section-validation";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";
import { resolveStorefrontSrc } from "@/lib/media/resolve-storefront-src";
import { cn } from "@/lib/utils";

function formatFormats(spec: CmsImageSpec) {
  return spec.formats.map((f) => f.replace("image/", "").toUpperCase()).join(", ");
}

function requiredSizeLabel(spec: CmsImageSpec) {
  if (spec.exactDimensions) {
    return `${spec.requiredWidth}×${spec.requiredHeight} exact`;
  }
  return `${spec.minWidth}×${spec.minHeight} min · ${spec.aspectRatio}`;
}

function aspectNumber(spec: CmsImageSpec) {
  const [w, h] = spec.aspectRatio.split(":").map(Number);
  if (Number.isFinite(w) && Number.isFinite(h) && h > 0) return w / h;
  return spec.requiredWidth / Math.max(1, spec.requiredHeight);
}

async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to read image dimensions."));
      image.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function cropToBlob(imageSrc: string, crop: Area, preferWebp: boolean): Promise<{ blob: Blob; mimeType: string; extension: string }> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to crop image."));
    img.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to crop image.");
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);

  const tryMime = preferWebp ? "image/webp" : "image/jpeg";
  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, tryMime, 0.92));
  let mimeType = tryMime;
  let extension = preferWebp ? "webp" : "jpg";
  if (!blob && preferWebp) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    mimeType = "image/jpeg";
    extension = "jpg";
  }
  if (!blob) throw new Error("Unable to export cropped image.");
  return { blob, mimeType, extension };
}

function resolveSrcFieldName(name: string) {
  return name.endsWith("_src") ? name : `${name}_src`;
}

function resolveAltFieldName(name: string, altName?: string) {
  if (altName) return altName;
  const base = name.endsWith("_src") ? name.slice(0, -4) : name;
  return `${base}_alt`;
}

export function CmsImageField({
  label,
  name,
  altName,
  defaultValue = "",
  defaultAlt = "",
  spec,
  onUpload,
  onPreviewChange,
  onUploadingChange,
  error,
  variant = "default"
}: {
  label: string;
  name: string;
  altName?: string;
  defaultValue?: string;
  defaultAlt?: string;
  spec: CmsImageSpec;
  onUpload?: (file: File) => Promise<{ src: string; alt?: string } | null>;
  onPreviewChange?: (src: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  error?: string;
  /** Compact: thumbnail only — no device switcher (section preview covers WYSIWYG). */
  variant?: "default" | "compact";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewSrc, setPreviewSrc] = useState(defaultValue);
  const [previewAlt, setPreviewAlt] = useState(defaultAlt);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const hasSafeArea = spec.safeArea === "left-40";
  const [showSafeArea, setShowSafeArea] = useState(hasSafeArea);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [dimReadout, setDimReadout] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [pendingMime, setPendingMime] = useState("image/jpeg");
  const [pendingName, setPendingName] = useState("crop.jpg");
  const previewWidths = { desktop: "100%", tablet: "768px", mobile: "390px" } as const;
  const isCompact = variant === "compact";

  const srcFieldName = resolveSrcFieldName(name);
  const altFieldName = resolveAltFieldName(name, altName);
  const previewAspect = spec.aspectRatio.includes(":")
    ? spec.aspectRatio.replace(":", " / ")
    : "16 / 9";
  const cropAspect = useMemo(() => aspectNumber(spec), [spec]);

  const displaySrc = useMemo(() => {
    if (!previewSrc) return "";
    if (previewSrc.startsWith("blob:") || previewSrc.startsWith("data:")) return previewSrc;
    return resolveStorefrontSrc(previewSrc) || previewSrc;
  }, [previewSrc]);

  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  // Keep preview in sync when server props refresh (e.g. after save + router.refresh).
  // Skip while a local blob preview / upload is in flight so we don't clobber the crop UI.
  useEffect(() => {
    if (previewSrc?.startsWith("blob:") || uploading) return;
    setPreviewSrc(defaultValue);
    setLoadFailed(false);
  }, [defaultValue]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: sync from props only

  useEffect(() => {
    if (uploading) return;
    setPreviewAlt(defaultAlt);
  }, [defaultAlt]); // eslint-disable-line react-hooks/exhaustive-deps

  const updatePreview = useCallback(
    (src: string) => {
      setPreviewSrc(src);
      onPreviewChange?.(src);
    },
    [onPreviewChange]
  );

  useEffect(() => {
    return () => {
      if (cropSrc?.startsWith("blob:")) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  const uploadValidated = useCallback(
    async (file: File) => {
      const validation = await validateImageFile(file, spec);
      if (!validation.valid) {
        const message = validation.errors[0]?.message ?? "Invalid image.";
        setLocalError(message);
        return;
      }
      const size = await readImageSize(file);
      setDimReadout(`${size.width}×${size.height}px`);
      const blobUrl = URL.createObjectURL(file);
      updatePreview(blobUrl);
      if (!onUpload) return;
      setUploading(true);
      try {
        const result = await raceWithTimeout(onUpload(file), undefined, "CMS image upload");
        if (result?.src) {
          URL.revokeObjectURL(blobUrl);
          updatePreview(result.src);
          if (result.alt) setPreviewAlt(result.alt);
          setUploaded(true);
          notify.success(FEEDBACK_MESSAGES.imageUploaded, { source: "cms", id: "cms-image-field:upload" });
        } else {
          setLocalError("Upload failed. Please try again.");
          updatePreview(defaultValue);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed. Please try again.";
        setLocalError(message);
        updatePreview(defaultValue);
      } finally {
        setUploading(false);
      }
    },
    [defaultValue, onUpload, spec, updatePreview]
  );

  const handleFile = useCallback(
    async (file: File) => {
      setLocalError(null);
      setUploaded(false);
      try {
        const size = await readImageSize(file);
        setDimReadout(`Selected ${size.width}×${size.height}px · required ${requiredSizeLabel(spec)}`);
        if (cropSrc?.startsWith("blob:")) URL.revokeObjectURL(cropSrc);
        const url = URL.createObjectURL(file);
        setCropSrc(url);
        setPendingMime(file.type || "image/jpeg");
        setPendingName(file.name || "crop.jpg");
        setCropZoom(1);
        setCrop({ x: 0, y: 0 });
        setCropOpen(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to read image.";
        setLocalError(message);
      }
    },
    [cropSrc, spec]
  );

  const confirmCrop = useCallback(async () => {
    if (!cropSrc || !croppedArea) return;
    setCropOpen(false);
    try {
      const preferWebp = spec.formats.includes("image/webp");
      const { blob, mimeType, extension } = await cropToBlob(cropSrc, croppedArea, preferWebp);
      const baseName = pendingName.replace(/\.[^.]+$/, "") || "crop";
      const file = new File([blob], `${baseName}.${extension}`, { type: mimeType });
      await uploadValidated(file);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Crop failed.";
      setLocalError(message);
    }
  }, [cropSrc, croppedArea, pendingName, spec.formats, uploadValidated]);

  return (
    <div data-cms-image-field className="grid gap-3 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1.5">
          <p className="text-sm font-medium text-[var(--platform-text-primary)]">{label}</p>
          <span
            data-cms-image-size-badge
            className="inline-flex w-fit items-center rounded-[6px] border-2 border-amber-600 bg-amber-50 px-2.5 py-1 text-xs font-bold tracking-wide text-amber-950"
          >
            Required {requiredSizeLabel(spec)}
          </span>
          <p className="text-xs text-[var(--platform-text-muted)]">
            {spec.aspectRatio} · ≤{spec.maxSizeMb}MB · {formatFormats(spec)}
          </p>
          {dimReadout ? (
            <p className="text-xs font-medium text-[var(--platform-text-secondary)]" data-cms-image-dim-readout>
              {dimReadout}
            </p>
          ) : null}
        </div>
        <label
          className={`platform-btn-secondary platform-btn-sm inline-flex cursor-pointer items-center gap-1.5 ${uploading ? "pointer-events-none opacity-60" : ""}`}
        >
          <Upload className="size-3.5" aria-hidden="true" />
          {uploading ? "Uploading…" : "Replace image"}
          <input
            ref={inputRef}
            type="file"
            accept={spec.formats.join(",")}
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      <details
        data-cms-image-upload-rules
        className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2.5 text-xs leading-relaxed text-[var(--platform-text-secondary)]"
      >
        <summary className="cursor-pointer font-semibold text-[var(--platform-text-primary)]">Image requirements</summary>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
          <li>
            Crop to <strong>{requiredSizeLabel(spec)}</strong> before upload
          </li>
          <li>Max file size: {spec.maxSizeMb}MB · Formats: {formatFormats(spec)}</li>
          <li>Wrong width, height, format, or size is rejected before upload</li>
        </ul>
      </details>

      {cropOpen && cropSrc ? (
        <div className="grid gap-3 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-3" data-cms-image-crop>
          <p className="text-xs font-semibold text-[var(--platform-text-primary)]">
            Crop locked to {spec.aspectRatio}
          </p>
          <div className="relative h-64 overflow-hidden rounded-[8px] bg-black">
            <Cropper
              image={cropSrc}
              crop={crop}
              zoom={cropZoom}
              aspect={cropAspect}
              onCropChange={setCrop}
              onZoomChange={setCropZoom}
              onCropComplete={(_area, areaPixels) => setCroppedArea(areaPixels)}
            />
          </div>
          <label className="grid gap-1 text-xs text-[var(--platform-text-secondary)]">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={cropZoom}
              onChange={(event) => setCropZoom(Number(event.target.value))}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="platform-btn-primary platform-btn-sm" onClick={() => void confirmCrop()}>
              Confirm crop &amp; upload
            </button>
            <button
              type="button"
              className="platform-btn-ghost platform-btn-sm"
              onClick={() => {
                setCropOpen(false);
                if (cropSrc.startsWith("blob:")) URL.revokeObjectURL(cropSrc);
                setCropSrc(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {!isCompact ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">Device preview</p>
          <div className="flex items-center gap-0.5 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-0.5">
            {([
              ["desktop", Monitor],
              ["tablet", Tablet],
              ["mobile", Smartphone]
            ] as const).map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                aria-label={`${key} image preview`}
                className={cn(
                  "rounded-[6px] p-1.5 transition",
                  previewDevice === key
                    ? "bg-[var(--platform-accent-soft)] text-[var(--platform-text-primary)]"
                    : "text-[var(--platform-text-muted)]"
                )}
                onClick={() => setPreviewDevice(key)}
              >
                <Icon className="size-4" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-3",
          !isCompact && "sm:grid-cols-[minmax(140px,220px)_minmax(0,1fr)]"
        )}
      >
        <div
          className="relative w-full overflow-hidden rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)]"
          style={{
            aspectRatio: previewAspect,
            maxWidth: isCompact ? "100%" : previewWidths[previewDevice]
          }}
        >
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displaySrc}
              alt={previewAlt || label}
              className="absolute inset-0 size-full object-cover"
              style={hasSafeArea ? { objectPosition: "right center" } : undefined}
              onLoad={() => setLoadFailed(false)}
              onError={() => setLoadFailed(true)}
            />
          ) : (
            <div
              className="grid h-full min-h-[80px] place-items-center gap-1 bg-[var(--platform-surface-muted)] text-[var(--platform-text-muted)]"
              aria-label="No image uploaded"
            >
              <ImageIcon className="size-6" aria-hidden="true" />
              <span className="text-[10px] font-medium uppercase tracking-wide">No image</span>
            </div>
          )}
          {previewSrc && loadFailed ? (
            <div className="absolute inset-0 grid place-items-center bg-[var(--platform-surface-muted)]/90 px-3 text-center">
              <p className="text-[11px] font-medium text-[var(--platform-text-secondary)]">
                Image URL saved — preview failed to load. Replace to update.
              </p>
            </div>
          ) : null}
          {showSafeArea && hasSafeArea ? (
            <div className="pointer-events-none absolute inset-y-0 left-0 w-[40%] border-r border-dashed border-white/70 bg-gradient-to-r from-black/45 to-transparent" />
          ) : null}
        </div>
        <div className="grid content-start gap-2">
          <input type="hidden" name={srcFieldName} value={previewSrc.startsWith("blob:") ? defaultValue : previewSrc} readOnly />
          <input type="hidden" name={altFieldName} value={previewAlt} readOnly />
          {hasSafeArea && !isCompact ? (
            <label className="inline-flex items-center gap-2 text-xs text-[var(--platform-text-secondary)]">
              <input type="checkbox" checked={showSafeArea} onChange={(event) => setShowSafeArea(event.target.checked)} />
              Show safe-area overlay
            </label>
          ) : null}
          {(error || localError) && (
            <p className="text-xs text-[var(--platform-danger)]" role="alert">
              {error || localError}
            </p>
          )}
          {uploaded && !localError ? (
            <p className="text-xs font-medium text-emerald-700" role="status">
              Uploaded successfully. Save or publish to apply this image.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
