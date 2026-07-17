"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";

export type CmsMediaAssetOption = {
  id: string;
  label: string;
  src: string;
  alt: string;
  width?: number;
  height?: number;
  usage?: string;
};

function inputClass() {
  return "h-10 w-full rounded-lg border border-slate-800 bg-[#0b1017] px-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20";
}

function mediaDimensions(asset?: CmsMediaAssetOption) {
  if (!asset?.width || !asset.height) return "Unknown";
  return `${asset.width} × ${asset.height}px`;
}

function CmsMediaField({
  label,
  name,
  altName,
  defaultValue = "",
  defaultAlt = "",
  mediaAssets,
  hint
}: {
  label: string;
  name: string;
  altName?: string;
  defaultValue?: string;
  defaultAlt?: string;
  mediaAssets: CmsMediaAssetOption[];
  hint?: string;
}) {
  const selectedMedia = mediaAssets.find((item) => item.src === defaultValue);
  const previewSrc = selectedMedia?.src || defaultValue;

  return (
    <div data-cms-media-field className="grid gap-3 rounded-xl border border-slate-800 bg-[#10151d] p-3 md:col-span-2">
      <div>
        <p className="text-xs font-medium text-slate-400">{label}</p>
        {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-[96px_minmax(0,1fr)]">
        <div data-cms-media-preview className="relative h-24 overflow-hidden rounded-lg border border-slate-800 bg-[#0b1017]">
          {previewSrc ? (
            <Image src={previewSrc} alt={defaultAlt || selectedMedia?.alt || label} fill sizes="96px" loading="lazy" className="object-cover" />
          ) : (
            <div className="grid h-full place-items-center">
              <ImageIcon className="h-5 w-5 text-slate-500" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="grid content-center gap-1 rounded-lg border border-slate-800 bg-[#0b1017] px-3 py-2 text-xs text-slate-500">
          <p>
            <span className="font-semibold text-slate-300">Dimensions:</span> {mediaDimensions(selectedMedia)}
          </p>
          {selectedMedia?.usage ? (
            <p>
              <span className="font-semibold text-slate-300">Used in:</span> {selectedMedia.usage}
            </p>
          ) : null}
        </div>
      </div>
      <label className="grid gap-1.5 text-xs font-medium text-slate-400">
        Select from media library
        <select name={name} defaultValue={defaultValue} className={inputClass()}>
          {defaultValue ? <option value={defaultValue}>Current image</option> : <option value="">Choose image</option>}
          {mediaAssets.map((item) => (
            <option key={item.id} value={item.src}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {altName ? (
        <label className="grid gap-1.5 text-xs font-medium text-slate-400">
          Image alt text
          <input type="text" name={altName} defaultValue={defaultAlt} className={inputClass()} />
        </label>
      ) : null}
    </div>
  );
}
