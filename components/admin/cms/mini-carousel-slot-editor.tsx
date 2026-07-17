"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, Replace } from "lucide-react";
import { saveHomepageV2SectionFormAction } from "@/app/admin/cms/actions";
import { CmsAssignmentSourceBadge } from "@/components/admin/cms/cms-assignment-source-badge";
import { CmsEditorSection } from "@/components/admin/cms/cms-editor-section";
import { CmsSelectField } from "@/components/admin/cms/cms-field";
import type { ProductReplaceItem } from "@/components/admin/cms/product-replace-picker";
import { ProductReplacePicker } from "@/components/admin/cms/product-replace-picker";
import type { CmsMiniCarouselSlide } from "@/config/homepage-cms-v2";
import { useOptionalHomepageBuilder } from "@/features/admin/cms/homepage-builder-context";
import {
  buildMiniCarouselSlidesFromAssignments,
  resolveMiniCarouselEditorState,
  type MiniCarouselSlotAssignment
} from "@/lib/cms/homepage-slot-assignment";
import type { Product } from "@/config/types";
import { formatINR } from "@/lib/utils";
import { cn } from "@/lib/utils";

function assignmentsToSlides(assignments: MiniCarouselSlotAssignment[]): CmsMiniCarouselSlide[] {
  return buildMiniCarouselSlidesFromAssignments(assignments);
}

function MiniCarouselPendingReporter({ onPendingChange }: { onPendingChange?: (pending: boolean) => void }) {
  const { pending } = useFormStatus();
  useEffect(() => {
    onPendingChange?.(pending);
  }, [onPendingChange, pending]);
  return null;
}

export function MiniCarouselSlotEditor({
  enabled,
  slides: storedSlides,
  products,
  browseCatalog = [],
  onDirty,
  onPendingChange,
  onPinRequest
}: {
  enabled: boolean;
  slides: CmsMiniCarouselSlide[];
  products: Product[];
  browseCatalog?: ProductReplaceItem[];
  onDirty?: () => void;
  onPendingChange?: (pending: boolean) => void;
  onPinRequest?: () => void;
}) {
  const builder = useOptionalHomepageBuilder();
  const initialState = useMemo(
    () => resolveMiniCarouselEditorState({ enabled, slides: storedSlides }, products),
    [enabled, products, storedSlides]
  );

  const [slots, setSlots] = useState(initialState.slots);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [expandedOverride, setExpandedOverride] = useState<number | null>(null);

  useEffect(() => {
    setSlots(initialState.slots);
  }, [initialState.slots]);

  const syncDraft = useCallback(
    (nextSlots: MiniCarouselSlotAssignment[]) => {
      const nextSlides = assignmentsToSlides(nextSlots);
      builder?.patchHomepageV2({
        miniCarousel: {
          enabled,
          slides: nextSlides
        }
      });
    },
    [builder, enabled]
  );

  const replaceSlot = (index: number, product: ProductReplaceItem) => {
    setSlots((current) => {
      const next = current.map((slot, i) => {
        if (i !== index) return slot;
        return {
          ...slot,
          slug: product.slug,
          product,
          source: "pinned" as const,
          heading: product.name,
          description: product.name,
          href: `/product/${product.slug}`,
          imageSrc: product.imageSrc,
          imageAlt: product.name,
          slideId: `slide-${product.slug}-${Date.now()}`
        };
      });
      syncDraft(next);
      return next;
    });
    onDirty?.();
  };

  const hiddenSlides = assignmentsToSlides(slots);

  return (
    <form
      action={saveHomepageV2SectionFormAction}
      className="grid gap-5"
      onChange={() => onDirty?.()}
    >
      <MiniCarouselPendingReporter onPendingChange={onPendingChange} />
      <input type="hidden" name="section_key" value="mini-carousel" />
      <input type="hidden" name="slide_count" value={String(hiddenSlides.length)} />
      {hiddenSlides.map((slide, index) => (
        <div key={slide.id} className="hidden" aria-hidden="true">
          <input type="hidden" name={`slide_${index}_id`} value={slide.id} />
          <input type="hidden" name={`slide_${index}_sort_order`} value={String(index)} />
          <input type="hidden" name={`slide_${index}_product_slug`} value={slide.productSlug} />
          <input type="hidden" name={`slide_${index}_enabled`} value={slide.enabled ? "true" : "false"} />
          <input type="hidden" name={`slide_${index}_heading`} value={slide.heading} />
          <input type="hidden" name={`slide_${index}_description`} value={slide.description} />
          <input type="hidden" name={`slide_${index}_cta_label`} value={slide.ctaLabel} />
          <input type="hidden" name={`slide_${index}_href`} value={slide.href} />
          <input type="hidden" name={`slide_${index}_image_src`} value={slide.imageSrc} />
          <input type="hidden" name={`slide_${index}_image_alt`} value={slide.imageAlt} />
        </div>
      ))}

      <CmsSelectField
        label="Enabled"
        name="enabled"
        defaultValue={enabled ? "true" : "false"}
        options={[
          { value: "true", label: "On" },
          { value: "false", label: "Off" }
        ]}
      />

      <CmsEditorSection
        title="Carousel products"
        description="These are the products visitors see in the mini carousel. Click Replace to swap any card."
      >
        {initialState.hasInferredAssignments ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
            <span>Some items are auto-selected from the live catalog.</span>
            {onPinRequest ? (
              <button type="button" onClick={onPinRequest} className="font-semibold text-amber-900 underline-offset-2 hover:underline">
                Save to CMS
              </button>
            ) : null}
          </div>
        ) : null}

        <ul className="grid gap-4">
          {slots.map((slot, index) => (
            <li
              key={`${slot.slideId}-${index}`}
              className="rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4 shadow-sm"
            >
              <div className="flex items-start gap-4">
                {slot.product ? (
                  <>
                    <div className="relative size-20 shrink-0 overflow-hidden rounded-[10px] border border-[var(--platform-border)] bg-white">
                      {slot.product.imageSrc ? (
                        <Image src={slot.product.imageSrc} alt="" fill sizes="80px" className="object-contain p-1" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
                          Position {index + 1}
                        </p>
                        <CmsAssignmentSourceBadge source={slot.source} />
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            slot.product.available ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                          )}
                        >
                          {slot.product.available ? "Published" : "Draft / hidden"}
                        </span>
                      </div>
                      <p className="truncate text-base font-semibold text-[var(--platform-text-primary)]">{slot.product.name}</p>
                      <p className="text-sm text-[var(--platform-text-secondary)]">
                        {slot.product.sku} · {slot.product.category}
                      </p>
                      <p className="text-sm font-semibold">{formatINR(slot.product.price)}</p>
                      <p className="text-xs text-[var(--platform-text-muted)]">
                        {slot.heading} · {slot.href}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="min-w-0 flex-1 py-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
                      Position {index + 1}
                    </p>
                    <CmsAssignmentSourceBadge source="missing" />
                  </div>
                )}

                <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReplaceIndex(index)}
                    className="platform-btn-secondary platform-btn-sm inline-flex items-center gap-1.5"
                  >
                    <Replace className="size-3.5" aria-hidden="true" />
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedOverride(expandedOverride === index ? null : index)}
                    className="platform-btn-ghost platform-btn-sm inline-flex items-center gap-1 text-[var(--platform-text-muted)]"
                  >
                    <ChevronDown className={cn("size-3.5 transition", expandedOverride === index && "rotate-180")} aria-hidden="true" />
                    Override
                  </button>
                </div>
              </div>

              {expandedOverride === index ? (
                <div className="mt-4 grid gap-2 border-t border-[var(--platform-border)] pt-4 text-xs text-[var(--platform-text-secondary)]">
                  <p>Heading: {slot.heading || "—"}</p>
                  <p>Link: {slot.href || "—"}</p>
                  <p>CTA: {slot.ctaLabel || "—"}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </CmsEditorSection>

      <ProductReplacePicker
        open={replaceIndex !== null}
        onClose={() => setReplaceIndex(null)}
        currentSlug={replaceIndex !== null ? slots[replaceIndex]?.slug : undefined}
        excludeSlugs={slots.filter((_, i) => i !== replaceIndex).map((s) => s.slug).filter(Boolean)}
        browseCatalog={browseCatalog}
        onSelect={(product) => {
          if (replaceIndex === null) return;
          replaceSlot(replaceIndex, product);
          setReplaceIndex(null);
        }}
        title={replaceIndex !== null ? `Replace carousel product in position ${replaceIndex + 1}` : "Replace product"}
      />
    </form>
  );
}
