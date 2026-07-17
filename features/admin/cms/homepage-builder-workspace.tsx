"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import type { CmsPreviewDevice } from "@/features/admin/cms/cms-editor-action-bar";
import { CmsResponsivePreviewFrame } from "@/components/admin/cms/cms-responsive-preview-frame";
import { cn } from "@/lib/utils";

export function HomepageBuilderWorkspace({
  editor,
  sectionPreview,
  fullPagePreview,
  device,
  onDeviceChange
}: {
  editor: ReactNode;
  sectionPreview: ReactNode;
  fullPagePreview: ReactNode;
  device: CmsPreviewDevice;
  onDeviceChange: (device: CmsPreviewDevice) => void;
}) {
  const [tab, setTab] = useState<"section" | "full">("section");
  const [editorWidthPercent, setEditorWidthPercent] = useState(52);
  const dragging = useRef(false);

  const onGutterMouseDown = useCallback(() => {
    dragging.current = true;
    const onMove = (event: MouseEvent) => {
      if (!dragging.current) return;
      const shell = document.querySelector("[data-homepage-builder-workspace]");
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      const next = ((event.clientX - rect.left) / rect.width) * 100;
      setEditorWidthPercent(Math.min(72, Math.max(28, next)));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return (
    <div
      data-homepage-builder-workspace
      className="flex min-h-0 flex-col"
      style={{ height: "calc(100dvh - var(--cms-chrome-offset, 11rem))" }}
    >
      <div className="flex min-h-0 flex-1">
        <div
          className="min-h-0 overflow-y-auto border-r border-[var(--platform-border)] p-5"
          style={{ width: `${editorWidthPercent}%` }}
        >
          {editor}
        </div>

        <button
          type="button"
          aria-label="Resize editor and preview panels"
          onMouseDown={onGutterMouseDown}
          className="w-1.5 shrink-0 cursor-col-resize bg-[var(--platform-border)] transition hover:bg-[var(--platform-accent)]/40"
        />

        <div className="flex min-h-0 min-w-[360px] flex-1 flex-col overflow-hidden p-5 lg:sticky lg:top-0 lg:self-start">
          <div className="mb-3 flex shrink-0 items-center gap-1 rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-1">
            {([
              ["section", "Section preview"],
              ["full", "Full page"]
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "flex-1 rounded-[8px] px-3 py-2 text-xs font-medium transition",
                  tab === key
                    ? "bg-[var(--platform-surface)] text-[var(--platform-text-primary)] shadow-sm"
                    : "text-[var(--platform-text-muted)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface)]">
            {tab === "section" ? (
              <CmsResponsivePreviewFrame device={device} onDeviceChange={onDeviceChange} label="Section preview">
                {sectionPreview}
              </CmsResponsivePreviewFrame>
            ) : (
              fullPagePreview
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
