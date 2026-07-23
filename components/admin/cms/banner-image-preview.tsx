"use client";

import Image from "next/image";
import type { CmsImageSpec } from "@/config/homepage-section-registry";
import { cn } from "@/lib/utils";

export type BannerPreviewDevice = "desktop" | "tablet" | "mobile";

const frames: Record<BannerPreviewDevice, { width: string; aspect: string; label: string }> = {
  desktop: { width: "100%", aspect: "8 / 3", label: "Desktop" },
  tablet: { width: "768px", aspect: "16 / 9", label: "Tablet" },
  mobile: { width: "390px", aspect: "4 / 3", label: "Mobile" }
};

export function BannerImagePreview({
  imageSrc,
  device = "desktop",
  onDeviceChange,
  spec
}: {
  imageSrc: string;
  device?: BannerPreviewDevice;
  onDeviceChange?: (device: BannerPreviewDevice) => void;
  spec: CmsImageSpec;
}) {
  const frame = frames[device];

  return (
    <div data-banner-image-preview className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="type-meta font-medium uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">Image preview</p>
        <div className="flex gap-1">
          {(Object.keys(frames) as BannerPreviewDevice[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onDeviceChange?.(key)}
              className={cn(
                "rounded-[6px] px-2 py-1 type-badge font-medium uppercase",
                device === key ? "bg-[var(--platform-accent-soft)] text-[var(--platform-text-primary)]" : "text-[var(--platform-text-muted)]"
              )}
            >
              {frames[key].label}
            </button>
          ))}
        </div>
      </div>
      <p className="type-meta text-[var(--platform-text-muted)]">
        Required {spec.requiredWidth}×{spec.requiredHeight} · {spec.aspectRatio} · ≤{spec.maxSizeMb}MB
      </p>
      <div className="flex justify-center overflow-hidden rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-3">
        <div className="relative overflow-hidden rounded-[6px] border border-[var(--platform-border)] bg-black" style={{ width: frame.width, maxWidth: "100%", aspectRatio: frame.aspect }}>
          {imageSrc ? (
            <Image src={imageSrc} alt="" fill sizes="800px" className="object-cover" />
          ) : (
            <div className="grid h-full min-h-[120px] place-items-center text-xs text-white/70">No image selected</div>
          )}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[40%] border-r border-dashed border-white/40 bg-gradient-to-r from-black/35 to-transparent" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
