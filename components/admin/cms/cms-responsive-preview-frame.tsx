"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import type { CmsPreviewDevice } from "@/features/admin/cms/cms-editor-action-bar";
import { cn } from "@/lib/utils";

export const CMS_PREVIEW_DEVICE_WIDTHS: Record<CmsPreviewDevice, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 390
};

export function CmsResponsivePreviewFrame({
  children,
  device,
  onDeviceChange,
  label = "Preview",
  className
}: {
  children: ReactNode;
  device: CmsPreviewDevice;
  onDeviceChange?: (device: CmsPreviewDevice) => void;
  label?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const deviceWidth = CMS_PREVIEW_DEVICE_WIDTHS[device];
  const scale = containerWidth > 0 ? Math.min(1, containerWidth / deviceWidth) : 1;
  const scaledHeight = contentHeight > 0 ? contentHeight * scale : undefined;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(node);
    setContainerWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContentHeight(entry.contentRect.height);
    });
    observer.observe(node);
    setContentHeight(node.scrollHeight || node.clientHeight);
    return () => observer.disconnect();
  }, [children, device]);

  return (
    <div
      className={cn("flex min-h-[420px] flex-1 flex-col", className)}
      data-cms-responsive-preview-frame
      data-cms-preview-device={device}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--platform-border)] px-3 py-2">
        <p className="type-meta font-medium uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">{label}</p>
        {onDeviceChange ? (
          <div className="flex items-center gap-0.5 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-0.5">
            {([
              ["desktop", Monitor],
              ["tablet", Tablet],
              ["mobile", Smartphone]
            ] as const).map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                aria-label={`${key} preview`}
                className={cn(
                  "rounded-[6px] p-1.5 transition",
                  device === key
                    ? "bg-[var(--platform-accent-soft)] text-[var(--platform-text-primary)]"
                    : "text-[var(--platform-text-muted)] hover:text-[var(--platform-text-secondary)]"
                )}
                onClick={() => onDeviceChange(key)}
              >
                <Icon className="size-4" aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div ref={containerRef} className="flex min-h-0 flex-1 justify-center overflow-auto bg-[var(--platform-surface-muted)] p-3">
        <div
          className="relative origin-top transition-[width,height] duration-200"
          style={{
            width: deviceWidth * scale,
            height: scaledHeight,
            minHeight: scaledHeight ? undefined : 320
          }}
        >
          <div
            ref={contentRef}
            data-cms-preview-scaled
            className="absolute left-0 top-0 overflow-hidden rounded-[8px] border border-[var(--platform-border)] bg-white shadow-sm [&_[data-full-viewport-banner]]:min-h-[min(100dvh,720px)]"
            style={{
              width: deviceWidth,
              transform: scale < 1 ? `scale(${scale})` : undefined,
              transformOrigin: "top left"
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
