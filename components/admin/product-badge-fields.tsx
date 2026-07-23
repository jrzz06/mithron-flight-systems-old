"use client";

import { useRef } from "react";
import { ProductFieldLabel } from "@/components/admin/product-info-tooltip";
import {
  PRODUCT_BADGE_PRESETS,
  PRODUCT_BADGE_STYLE_LABELS,
  PRODUCT_BADGE_STYLES,
  PRODUCT_BADGE_TEXT_MAX,
  normalizeProductBadgeStyle,
  type ProductBadgeStyle
} from "@/lib/product-badge";

export function ProductBadgeFields({
  text = "",
  style = "default"
}: {
  text?: string;
  style?: ProductBadgeStyle | string;
}) {
  const normalizedStyle = normalizeProductBadgeStyle(style);
  const textRef = useRef<HTMLInputElement>(null);
  const styleRef = useRef<HTMLSelectElement>(null);

  function applyPreset(preset: (typeof PRODUCT_BADGE_PRESETS)[number]) {
    if (textRef.current) textRef.current.value = preset.text;
    if (styleRef.current) styleRef.current.value = preset.style;
  }

  function clearRibbon() {
    if (textRef.current) textRef.current.value = "";
    if (styleRef.current) styleRef.current.value = "default";
  }

  return (
    <section data-product-badge-fields className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-meta font-semibold uppercase tracking-[0.12em] text-[var(--platform-text-muted)]">
          Product ribbon
        </p>
        <button
          type="button"
          onClick={clearRibbon}
          className="text-xs font-medium text-[var(--platform-text-secondary)] transition hover:text-[var(--platform-text-primary)]"
        >
          Clear ribbon
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRODUCT_BADGE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset)}
            className="rounded-full border border-[var(--platform-border)] px-3 py-1 text-xs font-medium text-[var(--platform-text-secondary)] transition hover:border-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)]"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm sm:col-span-2">
          <ProductFieldLabel tooltip="Short label on the product image. Leave empty to hide the ribbon.">
            Ribbon text
          </ProductFieldLabel>
          <input
            ref={textRef}
            name="badge_text"
            defaultValue={text}
            maxLength={PRODUCT_BADGE_TEXT_MAX}
            placeholder="Leave empty for no ribbon"
            className="h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)] focus:bg-[var(--platform-accent-soft)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
          />
          <span className="text-xs text-[var(--platform-text-muted)]">
            {PRODUCT_BADGE_TEXT_MAX} characters max. Empty means no ribbon on the storefront.
          </span>
        </label>
        <label className="grid gap-1.5 text-sm">
          <ProductFieldLabel tooltip="Color style for the ribbon badge.">
            Ribbon style
          </ProductFieldLabel>
          <select
            ref={styleRef}
            name="badge_style"
            defaultValue={normalizedStyle}
            className="h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus:bg-[var(--platform-accent-soft)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
          >
            {PRODUCT_BADGE_STYLES.map((option) => (
              <option key={option} value={option}>
                {PRODUCT_BADGE_STYLE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
