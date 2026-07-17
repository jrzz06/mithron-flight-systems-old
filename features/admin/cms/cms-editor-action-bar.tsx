"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Monitor, RefreshCw, RotateCcw, Save, Send, Smartphone, Tablet } from "lucide-react";
import { StatusPill } from "@/components/platform/status-pill";
import { appendPreviewRefreshParam, buildCmsPreviewHref } from "@/lib/cms/preview-href";
import { cn } from "@/lib/utils";

export function CmsEditorActionBar({
  sectionLabel,
  isDirty,
  isSaving,
  saveStatus,
  publishDisabled,
  previewHref,
  previewAnchor,
  onSaveDraft,
  onPublish,
  onDiscard,
  publishLabel = "Publish"
}: {
  sectionLabel: string;
  isDirty: boolean;
  isSaving: boolean;
  saveStatus?: "idle" | "draft-saved" | "published" | "unsaved";
  publishDisabled?: boolean;
  previewHref?: string;
  previewAnchor?: string;
  onSaveDraft?: () => void;
  onPublish?: () => void;
  onDiscard?: () => void;
  publishLabel?: string;
}) {
  const externalHref = previewHref ?? buildCmsPreviewHref({ anchor: previewAnchor, draft: true });
  const statusMessage =
    saveStatus === "published"
      ? "Published successfully"
      : saveStatus === "draft-saved"
        ? "Draft saved"
        : isDirty || saveStatus === "unsaved"
          ? "Unsaved changes"
          : null;

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--platform-border)] bg-[var(--platform-surface)]/95 px-4 py-3 backdrop-blur-md md:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="platform-type-section-title text-[var(--platform-text-primary)]">{sectionLabel}</p>
        {isDirty ? <StatusPill status="draft" /> : null}
        {isSaving ? <span className="text-xs text-[var(--platform-text-muted)]">Saving…</span> : null}
        {statusMessage ? (
          <span className="text-xs text-[var(--platform-text-secondary)]">{statusMessage}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={externalHref} target="_blank" className="platform-btn-secondary platform-btn-sm inline-flex items-center gap-1.5">
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Preview
        </Link>
        {onDiscard ? (
          <button type="button" onClick={onDiscard} className="platform-btn-ghost platform-btn-sm inline-flex items-center gap-1.5">
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Discard
          </button>
        ) : null}
        {onSaveDraft ? (
          <button type="button" onClick={onSaveDraft} disabled={isSaving} className="platform-btn-secondary platform-btn-sm inline-flex items-center gap-1.5 disabled:opacity-50">
            <Save className="size-3.5" aria-hidden="true" />
            Save Draft
          </button>
        ) : null}
        {onPublish ? (
          <button
            type="button"
            onClick={onPublish}
            disabled={isSaving || publishDisabled}
            className="platform-btn-primary platform-btn-sm inline-flex items-center gap-1.5 disabled:opacity-50"
            title={publishDisabled ? "Save your draft before publishing" : undefined}
          >
            <Send className="size-3.5" aria-hidden="true" />
            {publishLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type CmsPreviewDevice = "desktop" | "tablet" | "mobile";

export function CmsLivePreviewPanel({
  previewHref,
  previewAnchor,
  children,
  device = "desktop",
  onDeviceChange,
  refreshKey = 0,
  embedded = false
}: {
  previewHref?: string;
  previewAnchor?: string;
  children?: React.ReactNode;
  device?: CmsPreviewDevice;
  onDeviceChange?: (device: CmsPreviewDevice) => void;
  refreshKey?: number;
  embedded?: boolean;
}) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [iframeState, setIframeState] = useState<"loading" | "ready" | "error">("loading");

  const iframeSrc = useMemo(() => {
    const base = previewHref ?? buildCmsPreviewHref({ anchor: previewAnchor, draft: true });
    return appendPreviewRefreshParam(base, refreshNonce + refreshKey);
  }, [previewAnchor, previewHref, refreshKey, refreshNonce]);

  const handleRefresh = useCallback(() => {
    setIframeState("loading");
    setRefreshNonce((current) => current + 1);
  }, []);

  useEffect(() => {
    if (refreshKey > 0) {
      setIframeState("loading");
      setRefreshNonce((current) => current + 1);
    }
  }, [refreshKey]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        !embedded && "rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]"
      )}
    >
      {!embedded ? (
      <div className="flex items-center justify-between border-b border-[var(--platform-border)] px-4 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">Live preview</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="platform-btn-ghost platform-btn-sm inline-flex items-center gap-1"
            aria-label="Refresh preview"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </button>
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
                onClick={() => onDeviceChange?.(key)}
              >
                <Icon className="size-4" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </div>
      ) : (
        <div className="flex items-center justify-end border-b border-[var(--platform-border)] px-3 py-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="platform-btn-ghost platform-btn-sm inline-flex items-center gap-1"
            aria-label="Refresh preview"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
        <div
          className="relative mx-auto flex min-h-0 w-full flex-1 overflow-hidden rounded-[8px] border border-[var(--platform-border)] bg-black transition-[width] duration-200"
          style={{
            width: device === "desktop" ? "100%" : device === "tablet" ? "768px" : "390px",
            maxWidth: "100%"
          }}
        >
          {children ?? (
            <>
              {iframeState === "loading" ? (
                <div className="absolute inset-0 z-10 grid place-items-center bg-[var(--platform-surface-muted)] text-sm text-[var(--platform-text-muted)]">
                  Loading preview…
                </div>
              ) : null}
              {iframeState === "error" ? (
                <div className="absolute inset-0 z-10 grid place-items-center gap-2 bg-[var(--platform-surface-muted)] p-4 text-center">
                  <p className="text-sm text-[var(--platform-text-secondary)]">Preview failed to load.</p>
                  <Link
                    href={previewHref ?? buildCmsPreviewHref({ anchor: previewAnchor, draft: true })}
                    target="_blank"
                    className="platform-btn-secondary platform-btn-sm inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    Open in new tab
                  </Link>
                </div>
              ) : null}
              <iframe
                key={iframeSrc}
                title="Section preview"
                src={iframeSrc}
                className="min-h-[480px] w-full flex-1 border-0 bg-white"
                onLoad={() => setIframeState("ready")}
                onError={() => setIframeState("error")}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
