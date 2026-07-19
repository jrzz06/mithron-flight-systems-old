import Image from "next/image";
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

type ProductMultiImageFieldProps = {
  variant: "admin" | "supplier";
  defaults?: ProductMultiImageFieldDefaults;
  labelClassName?: string;
  fieldClassName?: string;
  fileInputClassName?: string;
};

export function ProductMultiImageField({
  variant,
  defaults,
  labelClassName = "text-sm text-[var(--platform-text-secondary)]",
  fieldClassName = "rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-[var(--platform-text-primary)]",
  fileInputClassName
}: ProductMultiImageFieldProps) {
  const accept = variant === "admin" ? IMAGE_ACCEPT : SUPPLIER_IMAGE_ACCEPT;
  const helper = productImageUploadNotice();
  const previewItems = (() => {
    const seen = new Set<string>();
    const items: Array<{ src: string; alt?: string; isPrimary?: boolean }> = [];

    const pushItem = (src: string, alt?: string, isPrimary = false) => {
      const normalized = src.trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      items.push({ src: normalized, alt, isPrimary });
    };

    if (defaults?.imageSrc) {
      pushItem(defaults.imageSrc, defaults.imageAlt, true);
    }

    for (const item of defaults?.galleryItems ?? []) {
      pushItem(item.src, item.alt);
    }

    for (const url of defaults?.galleryUrls ?? []) {
      pushItem(url);
    }

    return items;
  })();

  return (
    <div
      className="grid gap-3 rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)]/60 p-3"
      data-product-multi-image-field
      data-product-multi-image-variant={variant}
    >
      <div className="grid gap-1 text-sm">
        <span className={labelClassName}>Product images</span>
        <span className="text-xs text-[var(--platform-text-muted)]">{helper}</span>
      </div>

      {previewItems.length > 0 ? (
        <div className="grid gap-2" data-product-image-preview-grid>
          <span className={labelClassName}>Current images</span>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {previewItems.map((item) => {
              const resolvedSrc = resolveNextImageSrc(item.src) ?? item.src;
              return (
                <label
                  key={item.src}
                  className="group grid gap-2 rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)] p-2"
                  data-product-image-preview-item
                >
                  <div className="relative aspect-square overflow-hidden rounded-md bg-[var(--platform-surface-muted)]">
                    <Image
                      src={resolvedSrc}
                      alt={item.alt || (item.isPrimary ? "Primary product image" : "Gallery product image")}
                      fill
                      sizes="(max-width: 640px) 45vw, 180px"
                      className="object-cover"
                      loading="lazy"
                    />
                    {item.isPrimary ? (
                      <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                        Primary
                      </span>
                    ) : null}
                  </div>
                  <span className="inline-flex items-center gap-2 text-xs text-[var(--platform-text-secondary)]">
                    <input
                      type="checkbox"
                      name="removed_gallery_urls"
                      value={item.src}
                      className="size-3.5 rounded border-[var(--platform-border)]"
                    />
                    Remove
                  </span>
                </label>
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
          defaultValue={defaults?.imageSrc ?? ""}
          placeholder="Optional if uploading"
          className={fieldClassName}
        />
      </label>

      <label className="grid gap-1.5 text-sm">
        <span className={labelClassName}>Additional image URLs</span>
        <textarea
          name="gallery_urls"
          rows={3}
          defaultValue={defaults?.galleryUrls?.join("\n") ?? ""}
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
