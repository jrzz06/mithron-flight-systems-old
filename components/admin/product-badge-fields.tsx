"use client";

import { useState } from "react";
import { ProductFieldLabel } from "@/components/admin/product-info-tooltip";
import {
  PRODUCT_BADGE_PRESETS,
  PRODUCT_BADGE_STYLE_LABELS,
  PRODUCT_BADGE_STYLES,
  PRODUCT_BADGE_TEXT_MAX,
  normalizeProductBadgeStyle,
  productBadgeCssClass,
  type ProductBadgeStyle
} from "@/lib/product-badge";
import { cn } from "@/lib/utils";

const STYLE_SWATCHES: Record<ProductBadgeStyle, { bg: string; ink: string }> = {
  default: { bg: "#047857", ink: "#ffffff" },
  success: { bg: "#ff6b6b", ink: "#ffffff" },
  warning: { bg: "#c2410c", ink: "#ffffff" },
  premium: { bg: "#047857", ink: "#ffffff" },
  sale: { bg: "#e11d2e", ink: "#ffffff" }
};

export function ProductBadgeFields({
  text = "",
  style = "default"
}: {
  text?: string;
  style?: ProductBadgeStyle | string;
}) {
  const [ribbonText, setRibbonText] = useState(text);
  const [ribbonStyle, setRibbonStyle] = useState<ProductBadgeStyle>(normalizeProductBadgeStyle(style));

  function applyPreset(preset: (typeof PRODUCT_BADGE_PRESETS)[number]) {
    setRibbonText(preset.text);
    setRibbonStyle(preset.style);
  }

  function clearRibbon() {
    setRibbonText("");
    setRibbonStyle("default");
  }

  const previewLabel = ribbonText.trim();

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

      <div
        className="relative h-28 overflow-hidden rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface)]"
        data-testid="product-badge-preview"
        aria-hidden={!previewLabel}
      >
        {previewLabel ? (
          <span
            className={cn(
              "absolute top-0 left-0 z-10 inline-flex max-w-[70%] items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-[6px] px-2.5 py-1 text-[11px] font-semibold leading-tight tracking-[0.04em] shadow-none",
              productBadgeCssClass(ribbonStyle, "showroom")
            )}
          >
            {previewLabel}
          </span>
        ) : (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-[var(--platform-text-muted)]">
            No ribbon — leave text empty to hide on storefront
          </p>
        )}
        <div className="pointer-events-none absolute inset-x-8 bottom-3 top-8 rounded-md border border-dashed border-[var(--platform-border)] opacity-50" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm sm:col-span-2">
          <ProductFieldLabel tooltip="Short label on the product image, top-left. Leave empty to hide the ribbon.">
            Ribbon text
          </ProductFieldLabel>
          <input
            name="badge_text"
            value={ribbonText}
            onChange={(event) => setRibbonText(event.target.value)}
            maxLength={PRODUCT_BADGE_TEXT_MAX}
            placeholder="Leave empty for no ribbon"
            className="h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)] focus:bg-[var(--platform-accent-soft)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
          />
          <span className="text-xs text-[var(--platform-text-muted)]">
            {PRODUCT_BADGE_TEXT_MAX} characters max. Empty means no ribbon on the storefront.
          </span>
        </label>

        <div className="grid gap-1.5 text-sm sm:col-span-2">
          <ProductFieldLabel tooltip="Color style for the ribbon badge. Matches the storefront tag.">
            Ribbon style
          </ProductFieldLabel>
          <input type="hidden" name="badge_style" value={ribbonStyle} />
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Ribbon style">
            {PRODUCT_BADGE_STYLES.map((option) => {
              const swatch = STYLE_SWATCHES[option];
              const selected = ribbonStyle === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setRibbonStyle(option)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-xs font-medium transition",
                    selected
                      ? "border-[var(--platform-text-primary)] bg-[var(--platform-accent-soft)] text-[var(--platform-text-primary)]"
                      : "border-[var(--platform-border)] text-[var(--platform-text-secondary)] hover:border-[var(--platform-text-muted)]"
                  )}
                >
                  <span
                    className="inline-block h-4 w-4 shrink-0 rounded-[4px]"
                    style={{ background: swatch.bg, boxShadow: `inset 0 0 0 1px ${swatch.ink}33` }}
                    aria-hidden="true"
                  />
                  {PRODUCT_BADGE_STYLE_LABELS[option]}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
