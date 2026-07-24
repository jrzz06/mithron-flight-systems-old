"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { productImageUploadNotice } from "@/lib/product-image-limits";
import { resolveNextImageSrc } from "@/lib/media/next-image-src";
import { ProductImageFileInput } from "@/components/products/product-image-file-input";

// Must stay in sync with the server-side ALLOWED_MEDIA_MIME_TYPES in
// services/media-manager.ts. SVG is intentionally excluded on both sides:
// the server rejects it (arbitrary user-uploaded SVG can carry embedded
// scripts), so offering it in the picker would only produce a confusing
// late upload failure.
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif";
const SUPPLIER_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif";

export type ProductMultiImageFieldDefaults = {
  imageSrc?: string;
  imageAlt?: string;
  galleryUrls?: string[];
  galleryItems?: Array<{ src: string; alt?: string }>;
};

type PreviewItem = {
  src: string;
  alt?: string;
};

type ProductMultiImageFieldProps = {
  variant: "admin" | "supplier";
  defaults?: ProductMultiImageFieldDefaults;
  labelClassName?: string;
  fieldClassName?: string;
  fileInputClassName?: string;
};

function buildInitialItems(defaults?: ProductMultiImageFieldDefaults): PreviewItem[] {
  const seen = new Set<string>();
  const items: PreviewItem[] = [];

  const pushItem = (src: string, alt?: string) => {
    const normalized = src.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    items.push({ src: normalized, alt });
  };

  if (defaults?.imageSrc) {
    pushItem(defaults.imageSrc, defaults.imageAlt);
  }

  for (const item of defaults?.galleryItems ?? []) {
    pushItem(item.src, item.alt);
  }

  for (const url of defaults?.galleryUrls ?? []) {
    pushItem(url);
  }

  return items;
}

function moveItem<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function parseUrlLines(value: string) {
  return value
    .split(/[\n,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ProductMultiImageField({
  variant,
  defaults,
  labelClassName = "text-sm text-[var(--platform-text-secondary)]",
  fieldClassName = "rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-[var(--platform-text-primary)]",
  fileInputClassName
}: ProductMultiImageFieldProps) {
  const accept = variant === "admin" ? IMAGE_ACCEPT : SUPPLIER_IMAGE_ACCEPT;
  const helper = productImageUploadNotice();
  const [items, setItems] = useState<PreviewItem[]>(() => buildInitialItems(defaults));
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const primarySrc = items[0]?.src ?? "";
  const galleryUrlsValue = useMemo(
    () => items.slice(1).map((item) => item.src).join("\n"),
    [items]
  );

  function reorder(fromIndex: number, toIndex: number) {
    setItems((current) => moveItem(current, fromIndex, toIndex));
  }

  function handlePrimaryUrlChange(value: string) {
    const nextPrimary = value.trim();
    setItems((current) => {
      const rest = current.slice(1).filter((item) => item.src !== nextPrimary);
      if (!nextPrimary) return rest;
      const existing = current.find((item) => item.src === nextPrimary);
      return [{ src: nextPrimary, alt: existing?.alt }, ...rest];
    });
  }

  function handleGalleryUrlsChange(value: string) {
    const urls = parseUrlLines(value);
    setItems((current) => {
      const primary = current[0];
      const seen = new Set<string>();
      const next: PreviewItem[] = [];
      if (primary?.src) {
        seen.add(primary.src);
        next.push(primary);
      }
      for (const url of urls) {
        if (seen.has(url)) continue;
        seen.add(url);
        const existing = current.find((item) => item.src === url);
        next.push({ src: url, alt: existing?.alt });
      }
      return next;
    });
  }

  return (
    <div
      className="grid gap-3 rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)]/60 p-3"
      data-product-multi-image-field
      data-product-multi-image-variant={variant}
      data-product-image-reorder
    >
      {items.map((item) => (
        <input key={`ordered:${item.src}`} type="hidden" name="ordered_gallery_urls" value={item.src} />
      ))}

      <div className="grid gap-1 text-sm">
        <span className={labelClassName}>Product images</span>
        <span className="text-xs text-[var(--platform-text-muted)]">{helper}</span>
      </div>

      {items.length > 0 ? (
        <div className="grid gap-2" data-product-image-preview-grid>
          <span className={labelClassName}>Current images</span>
          <p className="text-xs text-[var(--platform-text-muted)]">
            Drag or use the arrows to reorder. The first image is primary.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((item, index) => {
              const resolvedSrc = resolveNextImageSrc(item.src) ?? item.src;
              const isPrimary = index === 0;
              return (
                <div
                  key={item.src}
                  className="group grid gap-2 rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)] p-2"
                  data-product-image-preview-item
                  data-product-image-reorder-item
                  draggable
                  onDragStart={(event) => {
                    setDragIndex(index);
                    event.dataTransfer.setData("text/plain", String(index));
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = Number(event.dataTransfer.getData("text/plain"));
                    const fromIndex = Number.isFinite(from) ? from : dragIndex;
                    if (fromIndex == null || Number.isNaN(fromIndex)) return;
                    reorder(fromIndex, index);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <div className="relative aspect-square overflow-hidden rounded-md bg-[var(--platform-surface-muted)]">
                    <Image
                      src={resolvedSrc}
                      alt={item.alt || (isPrimary ? "Primary product image" : "Gallery product image")}
                      fill
                      sizes="(max-width: 640px) 45vw, 180px"
                      className="object-cover pointer-events-none"
                      loading="lazy"
                      draggable={false}
                    />
                    {isPrimary ? (
                      <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 type-badge font-medium uppercase tracking-wide text-white">
                        Primary
                      </span>
                    ) : null}
                    <span
                      className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md bg-black/55 text-white"
                      aria-hidden="true"
                      data-product-image-drag-handle
                    >
                      <GripVertical className="size-3.5" />
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        data-product-image-move-left
                        aria-label="Move image left"
                        disabled={index === 0}
                        onClick={() => reorder(index, index - 1)}
                        className="inline-flex size-7 items-center justify-center rounded-md border border-[var(--platform-border)] text-[var(--platform-text-secondary)] transition hover:bg-[var(--platform-accent-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        data-product-image-move-right
                        aria-label="Move image right"
                        disabled={index === items.length - 1}
                        onClick={() => reorder(index, index + 1)}
                        className="inline-flex size-7 items-center justify-center rounded-md border border-[var(--platform-border)] text-[var(--platform-text-secondary)] transition hover:bg-[var(--platform-accent-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronRight className="size-3.5" />
                      </button>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs text-[var(--platform-text-secondary)]">
                      <input
                        type="checkbox"
                        name="removed_gallery_urls"
                        value={item.src}
                        className="size-3.5 rounded border-[var(--platform-border)]"
                      />
                      Remove
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <label className="grid gap-1.5 text-sm" data-product-local-image-upload>
        <span className={labelClassName}>Upload images</span>
        <ProductImageFileInput
          accept={accept}
          className={
            fileInputClassName
            ?? (variant === "admin"
              ? `${fieldClassName} py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-[var(--platform-accent-soft)] file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-[var(--platform-text-secondary)]`
              : "platform-file-input block w-full text-sm text-[var(--platform-text-secondary)] file:mr-3")
          }
        />
      </label>

      <label className="grid gap-1.5 text-sm" data-product-media-picker>
        <span className={labelClassName}>Primary image URL</span>
        <input
          name="image_src"
          type="url"
          value={primarySrc}
          onChange={(event) => handlePrimaryUrlChange(event.target.value)}
          placeholder="Optional if uploading"
          className={fieldClassName}
        />
      </label>

      <label className="grid gap-1.5 text-sm">
        <span className={labelClassName}>Additional image URLs</span>
        <textarea
          name="gallery_urls"
          rows={3}
          value={galleryUrlsValue}
          onChange={(event) => handleGalleryUrlsChange(event.target.value)}
          placeholder="One URL per line (optional)"
          className={fieldClassName}
        />
      </label>

      {variant === "supplier" ? (
        <label className="grid gap-1.5 text-sm">
          <span className={labelClassName}>Image description</span>
          <input
            name="image_alt"
            defaultValue={defaults?.imageAlt ?? ""}
            placeholder="Describe the product for accessibility"
            className={fieldClassName}
          />
        </label>
      ) : null}
    </div>
  );
}
