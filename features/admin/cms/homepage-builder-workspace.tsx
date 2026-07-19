"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { CmsPreviewDevice } from "@/features/admin/cms/cms-editor-action-bar";
import { cn } from "@/lib/utils";

export function HomepageBuilderWorkspace({
  editor,
  preview,
  device: _device,
  onDeviceChange: _onDeviceChange
}: {
  editor: ReactNode;
  preview: ReactNode;
  device?: CmsPreviewDevice;
  onDeviceChange?: (device: CmsPreviewDevice) => void;
}) {
  const [narrowPane, setNarrowPane] = useState<"edit" | "preview">("edit");
  const [editorWidthPercent, setEditorWidthPercent] = useState(52);
  const dragging = useRef(false);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const moveListenerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const upListenerRef = useRef<(() => void) | null>(null);

  const clearGutterListeners = useCallback(() => {
    if (moveListenerRef.current) {
      window.removeEventListener("mousemove", moveListenerRef.current);
      moveListenerRef.current = null;
    }
    if (upListenerRef.current) {
      window.removeEventListener("mouseup", upListenerRef.current);
      upListenerRef.current = null;
    }
    dragging.current = false;
  }, []);

  useEffect(() => () => clearGutterListeners(), [clearGutterListeners]);

  const onGutterMouseDown = useCallback(() => {
    clearGutterListeners();
    dragging.current = true;
    const onMove = (event: MouseEvent) => {
      if (!dragging.current) return;
      const shell = workspaceRef.current;
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      const next = ((event.clientX - rect.left) / rect.width) * 100;
      setEditorWidthPercent(Math.min(72, Math.max(28, next)));
    };
    const onUp = () => {
      clearGutterListeners();
    };
    moveListenerRef.current = onMove;
    upListenerRef.current = onUp;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [clearGutterListeners]);

  return (
    <div
      ref={workspaceRef}
      data-homepage-builder-workspace
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={
        {
          ["--cms-editor-w"]: `${editorWidthPercent}%`
        } as CSSProperties
      }
    >
      <div className="mb-3 flex shrink-0 items-center gap-1 rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-1 min-[1280px]:hidden">
        {(
          [
            ["edit", "Edit"],
            ["preview", "Preview"]
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setNarrowPane(key)}
            className={cn(
              "flex-1 rounded-[8px] px-3 py-2 text-xs font-medium transition",
              narrowPane === key
                ? "bg-[var(--platform-surface)] text-[var(--platform-text-primary)] shadow-sm"
                : "text-[var(--platform-text-muted)]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden min-[1280px]:grid-cols-[minmax(0,var(--cms-editor-w))_6px_minmax(0,1fr)]"
        data-cms-workspace-bands
      >
        <div
          data-cms-workspace-editor
          className={cn(
            "min-h-0 min-w-0 overflow-x-hidden overflow-y-auto border-b border-[var(--platform-border)] p-5 min-[1280px]:border-b-0 min-[1280px]:border-r",
            narrowPane !== "edit" && "hidden min-[1280px]:block"
          )}
        >
          {editor}
        </div>

        <button
          type="button"
          aria-label="Resize editor and preview panels"
          onMouseDown={onGutterMouseDown}
          className="hidden w-1.5 shrink-0 cursor-col-resize bg-[var(--platform-border)] transition hover:bg-[var(--platform-accent)]/40 min-[1280px]:block"
        />

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-col overflow-hidden p-5 min-[1280px]:min-w-[280px]",
            narrowPane !== "preview" && "hidden min-[1280px]:flex"
          )}
        >
          <div className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface)] min-[1280px]:min-h-0">
            {preview}
          </div>
        </div>
      </div>
    </div>
  );
}
