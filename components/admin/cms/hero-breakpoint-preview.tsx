"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type Breakpoint = "desktop" | "tablet" | "mobile";

const FRAME_CONFIG: Record<
  Breakpoint,
  { width: number; aspectRatio: string; objectPosition: string; label: string }
> = {
  desktop: {
    width: 1280,
    aspectRatio: "1920 / 800",
    objectPosition: "right center",
    label: "Desktop (≥1280px)"
  },
  tablet: {
    width: 768,
    aspectRatio: "1024 / 700",
    objectPosition: "right center",
    label: "Tablet (768–1279px)"
  },
  mobile: {
    width: 375,
    aspectRatio: "5 / 6",
    objectPosition: "center center",
    label: "Mobile (<768px)"
  }
};

export function HeroBreakpointPreview({
  src,
  alt,
  device,
  mobileOverrideSrc
}: {
  src: string;
  alt: string;
  device: Breakpoint;
  mobileOverrideSrc?: string;
}) {
  const frame = FRAME_CONFIG[device];
  const previewSrc = device === "mobile" && mobileOverrideSrc ? mobileOverrideSrc : src;

  if (!previewSrc) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--cms-border)] p-6 text-center text-xs text-[var(--cms-text-muted)]">
        Upload a 1920×800 hero image to preview breakpoints.
      </div>
    );
  }

  return (
    <div data-hero-breakpoint-preview={device} className="grid gap-2">
      <p className="type-meta font-semibold text-[var(--cms-text-secondary)]">{frame.label}</p>
      <div
        className="relative mx-auto w-full overflow-hidden rounded-xl border border-[var(--cms-border)] bg-[#050505]"
        style={{ maxWidth: frame.width, aspectRatio: frame.aspectRatio }}
      >
        <Image
          src={previewSrc}
          alt={alt || "Hero preview"}
          fill
          sizes={`${frame.width}px`}
          className="object-cover"
          style={{ objectPosition: frame.objectPosition }}
          unoptimized={previewSrc.startsWith("blob:")}
        />

        {device === "desktop" ? (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 left-0 w-[40%] bg-gradient-to-r from-black/55 via-black/35 to-transparent"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute inset-y-0 left-0 w-[40%] border-r border-dashed border-white/50"
              aria-hidden="true"
            />
            <p className="pointer-events-none absolute bottom-2 left-2 type-badge font-medium text-white/80">
              Text-safe zone (left 40%)
            </p>
          </>
        ) : null}

        {device === "mobile" && !mobileOverrideSrc ? (
          <p className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 type-badge text-white/85">
            Auto-crop from desktop master
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function HeroBreakpointTabs({
  device,
  onDeviceChange
}: {
  device: Breakpoint;
  onDeviceChange: (device: Breakpoint) => void;
}) {
  const tabs: Breakpoint[] = ["desktop", "tablet", "mobile"];
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-[var(--cms-border)] bg-[var(--cms-surface-inset)] p-1">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onDeviceChange(tab)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition",
            device === tab
              ? "bg-[var(--cms-surface-raised)] text-[var(--cms-text-primary)] shadow-sm"
              : "text-[var(--cms-text-muted)] hover:text-[var(--cms-text-primary)]"
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
