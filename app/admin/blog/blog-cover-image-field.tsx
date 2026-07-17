"use client";

import Image from "next/image";
import { useState } from "react";
import { Upload } from "lucide-react";
import { uploadCmsFieldImageAction } from "@/app/admin/cms/actions";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";

export function BlogCoverImageField({
  defaultSrc = "",
  defaultAlt = "",
  defaultMediaAssetId = ""
}: {
  defaultSrc?: string;
  defaultAlt?: string;
  defaultMediaAssetId?: string;
}) {
  const [src, setSrc] = useState(defaultSrc);
  const [alt, setAlt] = useState(defaultAlt);
  const [mediaAssetId, setMediaAssetId] = useState(defaultMediaAssetId);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function onFileChange(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("files", file);
      formData.append("bucket", "mithron-products");
      formData.append("folder", "blog");
      formData.append("usage_scope", "blog");
      formData.append("alt", alt || file.name);
      const result = await uploadCmsFieldImageAction(formData);
      if (!result.ok || !result.src) {
        const message = result.message || "Upload failed.";
        setError(message);
        notify.error(message, { source: "cms", id: "blog-cover:upload-error" });
        return;
      }
      setSrc(result.src);
      if (result.alt) setAlt(result.alt);
      if (result.mediaAssetId) setMediaAssetId(result.mediaAssetId);
      notify.success(FEEDBACK_MESSAGES.imageUploaded, { source: "cms", id: "blog-cover:upload" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setError(message);
      notify.error(message, { source: "cms", id: "blog-cover:upload-catch" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--platform-text-primary)]">Featured image (16:9)</p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-xs font-medium text-[var(--platform-text-secondary)]">
          <Upload className="size-3.5" aria-hidden="true" />
          {uploading ? "Uploading…" : "Upload image"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <input type="hidden" name="cover_image_src" value={src} />
      <input type="hidden" name="cover_image_media_asset_id" value={mediaAssetId} />
      <label className="grid gap-1 text-xs text-[var(--platform-text-muted)]">
        Image alt text
        <input
          name="cover_image_alt"
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          className="h-10 rounded-[10px] border-0 bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
        />
      </label>

      <div className="relative aspect-video overflow-hidden rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface)]">
        {src ? (
          <Image src={src} alt={alt || "Cover preview"} fill className="object-cover" sizes="(max-width: 768px) 100vw, 640px" unoptimized />
        ) : (
          <div className="grid h-full place-items-center text-xs text-[var(--platform-text-muted)]">No image yet</div>
        )}
      </div>
      {error ? <p className="text-xs text-rose-500">{error}</p> : null}
    </div>
  );
}
