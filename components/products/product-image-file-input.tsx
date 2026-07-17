"use client";

import { ChangeEvent, useState } from "react";
import {
  formatProductImageBytes,
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_IMAGE_COUNT,
  PREFERRED_PRODUCT_IMAGE_BYTES,
  RECOMMENDED_PRODUCT_IMAGE_HEIGHT,
  RECOMMENDED_PRODUCT_IMAGE_WIDTH
} from "@/lib/product-image-limits";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";

type SelectedImageMeta = {
  name: string;
  width: number;
  height: number;
  sizeLabel: string;
  overPreferredSize: boolean;
  nonSquarePreview: boolean;
};

type ProductImageFileInputProps = {
  accept: string;
  className?: string;
};

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || 0;
      const height = image.naturalHeight || 0;
      URL.revokeObjectURL(objectUrl);
      resolve({ width, height });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: 0, height: 0 });
    };
    image.src = objectUrl;
  });
}

export function ProductImageFileInput({ accept, className }: ProductImageFileInputProps) {
  const [selectedMeta, setSelectedMeta] = useState<SelectedImageMeta[]>([]);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      setSelectedMeta([]);
      return;
    }

    if (files.length > MAX_PRODUCT_IMAGE_COUNT) {
      const message = `You can upload up to ${MAX_PRODUCT_IMAGE_COUNT} images at once.`;
      notify.warning(message, { source: "upload", id: "product-images:count" });
      event.target.value = "";
      setSelectedMeta([]);
      return;
    }

    const rejected = files.filter((file) => file.size > MAX_PRODUCT_IMAGE_BYTES || !file.type.startsWith("image/"));
    if (rejected.length) {
      notify.error(FEEDBACK_MESSAGES.uploadFailed, {
        source: "upload",
        id: "product-images:validation",
        description: "One or more files are not valid images or exceed the size limit."
      });
      event.target.value = "";
      setSelectedMeta([]);
      return;
    }

    const meta = await Promise.all(
      files.map(async (file) => {
        const { width, height } = await readImageDimensions(file);
        return {
          name: file.name,
          width,
          height,
          sizeLabel: formatProductImageBytes(file.size),
          overPreferredSize: file.size > PREFERRED_PRODUCT_IMAGE_BYTES,
          nonSquarePreview:
            width > 0
            && height > 0
            && (width !== RECOMMENDED_PRODUCT_IMAGE_WIDTH || height !== RECOMMENDED_PRODUCT_IMAGE_HEIGHT)
        };
      })
    );
    setSelectedMeta(meta);

    notify.success(`${files.length} image${files.length === 1 ? "" : "s"} selected`, {
      source: "upload",
      id: "product-images:selected",
      description: "Images will upload when you save the product."
    });
  }

  return (
    <div className="grid gap-2" data-product-image-file-input>
      <input
        type="file"
        name="image_files"
        multiple
        accept={accept}
        className={className}
        onChange={(event) => {
          void handleChange(event);
        }}
      />
      {selectedMeta.length > 0 ? (
        <ul
          className="grid gap-1 rounded-md border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-2.5 py-2 text-xs text-[var(--platform-text-secondary)]"
          data-product-image-selection-meta
        >
          {selectedMeta.map((item) => (
            <li key={`${item.name}-${item.width}x${item.height}-${item.sizeLabel}`}>
              <span className="font-medium text-[var(--platform-text-primary)]">{item.name}</span>
              {": "}
              {item.width > 0 && item.height > 0
                ? `${item.width}×${item.height} px`
                : "dimensions unavailable"}
              {`, ${item.sizeLabel}`}
              {item.nonSquarePreview || item.overPreferredSize ? (
                <span className="text-[var(--platform-text-muted)]">
                  {" "}
                  (
                  {[
                    item.nonSquarePreview
                      ? `recommended ${RECOMMENDED_PRODUCT_IMAGE_WIDTH}×${RECOMMENDED_PRODUCT_IMAGE_HEIGHT}`
                      : null,
                    item.overPreferredSize ? "prefer under 2 MB" : null
                  ]
                    .filter(Boolean)
                    .join("; ")}
                  )
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
