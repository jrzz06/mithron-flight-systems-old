"use client";

import { wrapServerAction } from "@/hooks/use-async-action";

import { useState } from "react";
import {
  publishHeroBannerFormAction,
  saveHeroBannerDraftFormAction
} from "@/app/admin/cms/actions";
import { CmsField, CmsStatusPill, cmsPrimaryButtonClass, cmsSecondaryButtonClass } from "@/components/admin/cms/cms-field";
import { CmsImageField } from "@/components/admin/cms/cms-image-field";
import { HeroBreakpointPreview, HeroBreakpointTabs } from "@/components/admin/cms/hero-breakpoint-preview";
import { AdminStickyActionFooter } from "@/components/admin/module-panel";
import { CMS_IMAGE_SPECS } from "@/config/homepage-section-registry";
import { cn } from "@/lib/utils";

const timedSaveHeroBannerDraftFormAction = wrapServerAction(saveHeroBannerDraftFormAction, { label: "Save hero banner draft" });
const timedPublishHeroBannerFormAction = wrapServerAction(publishHeroBannerFormAction, { label: "Publish hero banner" });

export type HeroCarouselSlideRecord = {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
  imageSrc: string;
  imageAlt: string;
  imageMobileSrc: string;
  imageMobileAlt: string;
  status: string;
  sortOrder: number;
  isVisible: boolean;
};

function SlideTab({
  index,
  status,
  active,
  onSelect
}: {
  index: number;
  status: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition",
        active
          ? "border-[var(--cms-accent)] bg-[var(--cms-accent-soft)] text-[var(--cms-text-primary)]"
          : "border-[var(--cms-border)] bg-[var(--cms-surface-inset)] text-[var(--cms-text-secondary)] hover:border-[var(--cms-border-strong)]"
      )}
    >
      Slide {index + 1}
      <CmsStatusPill status={status} />
    </button>
  );
}

export function HeroCarouselSlideEditor({
  heroes,
  device,
  onDeviceChange,
  onUpload
}: {
  heroes: HeroCarouselSlideRecord[];
  device: "desktop" | "tablet" | "mobile";
  onDeviceChange: (device: "desktop" | "tablet" | "mobile") => void;
  onUpload?: (file: File) => Promise<{ src: string; alt?: string } | null>;
}) {
  const [activeId, setActiveId] = useState(heroes[0]?.id ?? "");
  const [previewSrc, setPreviewSrc] = useState(heroes[0]?.imageSrc ?? "");
  const [previewMobileSrc, setPreviewMobileSrc] = useState(heroes[0]?.imageMobileSrc ?? "");

  const active = heroes.find((hero) => hero.id === activeId) ?? heroes[0];

  if (!active) {
    return (
      <p className="text-sm text-[var(--cms-text-muted)]">
        No hero slides yet. Add slides from advanced CMS or seed the database.
      </p>
    );
  }

  return (
    <div data-cms-hero-carousel-editor className="grid gap-4">
      <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {heroes.map((hero, index) => (
          <SlideTab
            key={hero.id}
            index={index}
            status={hero.status}
            active={hero.id === active.id}
            onSelect={() => {
              setActiveId(hero.id);
              setPreviewSrc(hero.imageSrc);
              setPreviewMobileSrc(hero.imageMobileSrc);
            }}
          />
        ))}
      </div>

      <form id={`hero-draft-${active.id}`} action={timedSaveHeroBannerDraftFormAction} className="grid gap-4">
        <input type="hidden" name="id" value={active.id} />
        <input type="hidden" name="sort_order" value={String(active.sortOrder)} />
        <input type="hidden" name="is_visible" value={active.isVisible ? "on" : "off"} />
        <input type="hidden" name="composition_media_position" value="right center" />
        <input type="hidden" name="composition_mobile_media_position" value="center center" />

        <div className="grid gap-4 min-[1280px]:grid-cols-2">
          <CmsField label="Headline" name="title" defaultValue={active.title} />
          <CmsField label="Subheadline" name="subtitle" defaultValue={active.subtitle} />
          <CmsField label="CTA label" name="cta_label" defaultValue={active.ctaLabel} />
          <CmsField label="CTA link" name="href" defaultValue={active.href} />
        </div>

        <CmsImageField
          label="Desktop hero image (1920×800)"
          name="image"
          altName="image_alt"
          defaultValue={active.imageSrc}
          defaultAlt={active.imageAlt}
          spec={CMS_IMAGE_SPECS.hero}
          onUpload={onUpload}
          onPreviewChange={setPreviewSrc}
        />

        <div className="grid gap-3 rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-surface-inset)] p-4">
          <p className="text-xs font-medium text-[var(--cms-text-secondary)]">Optional mobile override (750×900 recommended)</p>
          <CmsImageField
            label="Mobile override image"
            name="image_mobile"
            altName="image_mobile_alt"
            defaultValue={active.imageMobileSrc}
            defaultAlt={active.imageMobileAlt}
            spec={{
              ...CMS_IMAGE_SPECS.hero,
              requiredWidth: 750,
              requiredHeight: 900,
              recommendedWidth: 750,
              recommendedHeight: 900,
              minWidth: 750,
              minHeight: 900,
              aspectRatio: "5:6",
              exactDimensions: false
            }}
            onUpload={onUpload}
            onPreviewChange={setPreviewMobileSrc}
          />
        </div>

        <HeroBreakpointTabs device={device} onDeviceChange={onDeviceChange} />
        <HeroBreakpointPreview
          src={previewSrc || active.imageSrc}
          alt={active.imageAlt}
          device={device}
          mobileOverrideSrc={previewMobileSrc || active.imageMobileSrc}
        />

        <AdminStickyActionFooter>
          <button type="submit" form={`hero-draft-${active.id}`} className={cmsPrimaryButtonClass()}>
            Save Draft
          </button>
          <button type="submit" form={`hero-publish-${active.id}`} className={cmsSecondaryButtonClass()}>
            Publish slide
          </button>
        </AdminStickyActionFooter>
      </form>

      <form id={`hero-publish-${active.id}`} action={timedPublishHeroBannerFormAction} className="hidden">
        <input type="hidden" name="id" value={active.id} />
        <input type="hidden" name="change_summary" value={`Publish hero banner ${active.title}`} />
      </form>

      {active.status.toLowerCase() !== "published" ? (
        <p className="text-xs text-amber-700" data-testid="hero-draft-status-hint">
          This slide is currently <strong>{active.status}</strong> and will not appear on the homepage until published.
        </p>
      ) : null}
    </div>
  );
}
