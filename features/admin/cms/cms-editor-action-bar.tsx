"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Monitor, RefreshCw, Save, Send, Smartphone, Tablet } from "lucide-react";
import { appendPreviewRefreshParam, buildCmsPreviewHref } from "@/lib/cms/preview-href";
import { cn } from "@/lib/utils";

export function CmsEditorActionBar({
  sectionLabel,
  isDirty,
  isSaving,
  saveStatus,
  publishDisabled,
  publishDisabledReason,
  previewHref,
  previewAnchor,
  onSave,
  onPublish,
  publishLabel = "Publish",
  showSave = true,
  showPublish = true
}: {
  sectionLabel: string;
  isDirty: boolean;
  isSaving: boolean;
  saveStatus?: "idle" | "saved" | "published" | "unsaved";
  publishDisabled?: boolean;
  publishDisabledReason?: string;
  previewHref?: string;
  previewAnchor?: string;
  onSave?: () => void;
  onPublish?: () => void;
  publishLabel?: string;
  showSave?: boolean;
  showPublish?: boolean;
}) {
  const externalHref = previewHref ?? buildCmsPreviewHref({ anchor: previewAnchor, draft: true });
  const [flash, setFlash] = useState<"saved" | "published" | null>(null);

  useEffect(() => {
    if (saveStatus === "saved" || saveStatus === "published") {
      setFlash(saveStatus);
      const timer = window.setTimeout(() => setFlash(null), 1800);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [saveStatus]);

  const statusLabel = isSaving
    ? "Saving…"
    : flash === "published"
      ? "Published"
      : flash === "saved"
        ? "Saved"
        : isDirty || saveStatus === "unsaved"
          ? "Unsaved changes"
          : null;

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--platform-border)] bg-[var(--platform-surface)]/95 px-4 py-3 backdrop-blur-md md:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="platform-type-section-title text-[var(--platform-text-primary)]">{sectionLabel}</p>
        {statusLabel ? (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 type-meta font-semibold transition-opacity duration-200",
              isSaving || saveStatus === "unsaved" || isDirty
                ? "bg-amber-100 text-amber-950"
                : "bg-emerald-100 text-emerald-900"
            )}
            role="status"
            aria-live="polite"
          >
            {statusLabel}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-busy={isSaving || undefined}>
        <Link
          href={externalHref}
          target="_blank"
          className="platform-btn-secondary platform-btn-sm inline-flex items-center gap-1.5 transition active:scale-[0.98]"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Preview
        </Link>
        {showSave && onSave ? (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="platform-btn-secondary platform-btn-sm inline-flex items-center gap-1.5 transition active:scale-[0.98] disabled:opacity-50"
          >
            <Save className="size-3.5" aria-hidden="true" />
            {isSaving ? "Saving…" : "Save"}
          </button>
        ) : null}
        {showPublish && onPublish ? (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={onPublish}
              disabled={isSaving || publishDisabled}
              className="platform-btn-primary platform-btn-sm inline-flex items-center gap-1.5 transition active:scale-[0.98] disabled:opacity-50"
              title={
                publishDisabled
                  ? publishDisabledReason || "Fix validation errors before publishing"
                  : isDirty
                    ? "Saves then publishes to the live homepage"
                    : "Publishes the saved changes to the live homepage"
              }
              aria-describedby={publishDisabled && publishDisabledReason ? "cms-publish-blocked-reason" : undefined}
            >
              <Send className="size-3.5" aria-hidden="true" />
              {publishLabel}
            </button>
            {publishDisabled && publishDisabledReason ? (
              <p id="cms-publish-blocked-reason" className="max-w-[16rem] text-right type-meta font-medium text-amber-800">
                {publishDisabledReason}
              </p>
            ) : null}
          </div>
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
      <div className="flex items-center justify-between border-b border-[var(--platform-border)] px-3 py-2">
        <p className="type-meta font-medium uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">
          Preview
        </p>
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
            {(
              [
                ["desktop", Monitor],
                ["tablet", Tablet],
                ["mobile", Smartphone]
              ] as const
            ).map(([key, Icon]) => (
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
                title="Homepage preview"
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
