"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { ImageIcon, Monitor, Smartphone, Tablet, Upload } from "lucide-react";
import type { CmsImageSpec } from "@/config/homepage-section-registry";
import { validateImageFile } from "@/lib/cms/section-validation";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";
import { cn } from "@/lib/utils";

function formatSpecLine(spec: CmsImageSpec) {
  return `${spec.recommendedWidth}×${spec.recommendedHeight} · ${spec.aspectRatio} · ≤${spec.maxSizeMb}MB`;
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
  error
}: {
  label: string;
  name: string;
  altName?: string;
  defaultValue?: string;
  defaultAlt?: string;
  spec: CmsImageSpec;
  onUpload?: (file: File) => Promise<{ src: string; alt?: string } | null>;
  onPreviewChange?: (src: string) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewSrc, setPreviewSrc] = useState(defaultValue);
  const [previewAlt, setPreviewAlt] = useState(defaultAlt);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [showSafeArea, setShowSafeArea] = useState(spec.safeArea === "left-40");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const previewWidths = { desktop: "100%", tablet: "768px", mobile: "390px" } as const;

  const srcFieldName = resolveSrcFieldName(name);
  const altFieldName = resolveAltFieldName(name, altName);
  const previewAspect = spec.aspectRatio.includes(":")
    ? spec.aspectRatio.replace(":", " / ")
    : "16 / 9";

  const updatePreview = useCallback(
    (src: string) => {
      setPreviewSrc(src);
      onPreviewChange?.(src);
    },
    [onPreviewChange]
  );

  const handleFile = useCallback(
    async (file: File) => {
      setLocalError(null);
      setUploaded(false);
      const validation = await validateImageFile(file, spec);
      if (!validation.valid) {
        const message = validation.errors[0]?.message ?? "Invalid image.";
        setLocalError(message);
        notify.error(message, { source: "cms", id: "cms-image-field:validation" });
        return;
      }

      const blobUrl = URL.createObjectURL(file);
      updatePreview(blobUrl);

      if (onUpload) {
        setUploading(true);
        try {
          const result = await raceWithTimeout(onUpload(file), undefined, "CMS image upload");
          if (result?.src) {
            updatePreview(result.src);
            if (result.alt) setPreviewAlt(result.alt);
            setUploaded(true);
            notify.success(FEEDBACK_MESSAGES.imageUploaded, { source: "cms", id: "cms-image-field:upload" });
          } else {
            const message = "Upload failed. Please try again.";
            setLocalError(message);
            notify.error(FEEDBACK_MESSAGES.uploadFailed, { source: "cms", id: "cms-image-field:upload-empty" });
            updatePreview(defaultValue);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed. Please try again.";
          setLocalError(message);
          notify.error(FEEDBACK_MESSAGES.uploadFailed, { source: "cms", id: "cms-image-field:upload-error" });
          updatePreview(defaultValue);
        } finally {
          setUploading(false);
        }
      }
    },
    [defaultValue, onUpload, spec, updatePreview]
  );

  return (
    <div data-cms-image-field className="grid gap-3 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[var(--platform-text-primary)]">{label}</p>
          <p className="mt-1 text-xs text-[var(--platform-text-muted)]">
            Required {spec.requiredWidth}×{spec.requiredHeight} · {formatSpecLine(spec)}
          </p>
          <p className="text-xs text-[var(--platform-text-muted)]">
            {spec.exactDimensions ? "Exact dimensions" : `Min ${spec.minWidth}×${spec.minHeight}`} ·{" "}
            {spec.formats.map((f) => f.replace("image/", "").toUpperCase()).join(", ")}
          </p>
        </div>
        <label className={`platform-btn-secondary platform-btn-sm inline-flex cursor-pointer items-center gap-1.5 ${uploading ? "pointer-events-none opacity-60" : ""}`}>
          <Upload className="size-3.5" aria-hidden="true" />
          {uploading ? "Uploading…" : "Upload"}
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

      <div className="grid gap-3 sm:grid-cols-[minmax(140px,220px)_minmax(0,1fr)]">
        <div
          className="relative w-full overflow-hidden rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)]"
          style={{ aspectRatio: previewAspect, maxWidth: previewWidths[previewDevice] }}
        >
          {previewSrc ? (
            <>
              <Image
                src={previewSrc}
                alt={previewAlt || label}
                fill
                sizes="220px"
                className="object-cover"
                style={spec.safeArea === "left-40" ? { objectPosition: "right center" } : undefined}
                unoptimized={previewSrc.startsWith("blob:")}
              />
              {showSafeArea && spec.safeArea === "left-40" ? (
                <>
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 w-[40%] bg-gradient-to-r from-black/45 to-transparent"
                    aria-hidden="true"
                  />
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 w-[40%] border-r border-dashed border-white/70"
                    aria-hidden="true"
                  />
                </>
              ) : null}
              {showSafeArea && spec.safeArea !== "left-40" ? (
                <div className="pointer-events-none absolute inset-[8%] rounded-lg border border-dashed border-white/70" aria-hidden="true" />
              ) : null}
            </>
          ) : (
            <div className="grid h-full min-h-[80px] place-items-center">
              <ImageIcon className="size-6 text-[var(--platform-text-muted)]" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="grid content-start gap-2">
          <input
            type="hidden"
            name={srcFieldName}
            value={previewSrc.startsWith("blob:") ? defaultValue : previewSrc}
            readOnly
          />
          <input type="hidden" name={altFieldName} value={previewAlt} readOnly />
          <label className="inline-flex items-center gap-2 text-xs text-[var(--platform-text-secondary)]">
            <input type="checkbox" checked={showSafeArea} onChange={(event) => setShowSafeArea(event.target.checked)} />
            Show safe-area overlay
          </label>
          {(error || localError) && (
            <p className={cn("text-xs text-[var(--platform-danger)]")} role="alert">{error || localError}</p>
          )}
          {uploaded && !localError ? (
            <p className="text-xs font-medium text-emerald-700" role="status">Uploaded successfully. Save or publish to apply this image.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
