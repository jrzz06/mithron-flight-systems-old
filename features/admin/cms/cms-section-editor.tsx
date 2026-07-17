"use client";

import { wrapServerAction } from "@/hooks/use-async-action";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useOptionalAdminRealtime } from "@/components/admin/realtime/admin-realtime-provider";
import { markControlPlaneLiveSyncFlush } from "@/lib/control-plane/shared-live-sync-coordinator";
import {
  pinMiniCarouselDraftClientAction,
  publishHomepageSectionClientAction,
  publishHomepageV1ClientAction,
  publishHomepageV2ClientAction,
  saveHomepageMissionFormAction,
  saveHomepageShelfClientAction,
  saveHomepageTestimonialsHeaderFormAction,
  saveHomepageV2SectionFormAction,
  uploadCmsFieldImageAction
} from "@/app/admin/cms/actions";
import { BannerImagePreview } from "@/components/admin/cms/banner-image-preview";
import { CmsField, CmsSelectField, CmsTextAreaField, cmsPrimaryButtonClass } from "@/components/admin/cms/cms-field";
import { CmsImageField } from "@/components/admin/cms/cms-image-field";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { HeroCarouselSlideEditor } from "@/components/admin/cms/hero-carousel-slide-editor";
import { MiniCarouselSlotEditor } from "@/components/admin/cms/mini-carousel-slot-editor";
import { MissionTileEditor } from "@/components/admin/cms/mission-tile-editor";
import { ShelfProductReplaceEditor } from "@/components/admin/cms/shelf-product-replace-editor";
import type { CmsMediaAssetOption } from "@/components/admin/cms-media-field";
import { CMS_IMAGE_SPECS } from "@/config/homepage-section-registry";
import {
  getBuilderSectionLabel,
  getHomepageSectionDefinition,
  fullViewportBannerIndex,
  interShelfBannerIndex,
  missionKeyFromSectionId,
  shelfKeyFromSectionId,
  type HomepageSectionId
} from "@/config/homepage-section-registry";
import type { HomepageCmsContent, HomepageShelfCms } from "@/config/homepage-cms";
import { SHELF_PRODUCT_CARD_SLOTS } from "@/config/homepage-cms";
import type { HomepageCmsV2Content } from "@/config/homepage-cms-v2";
import type { Product } from "@/config/types";
import { BuilderValidationBanner } from "@/features/admin/cms/builder-validation-banner";
import { CmsEditorActionBar, CmsLivePreviewPanel } from "@/features/admin/cms/cms-editor-action-bar";
import { HomepageBuilderProvider, useOptionalHomepageBuilder } from "@/features/admin/cms/homepage-builder-context";
import { HomepageBuilderWorkspace } from "@/features/admin/cms/homepage-builder-workspace";
import { HomepageBuilderNav } from "@/features/admin/cms/homepage-builder-nav";
import { HomepageSectionPreview } from "@/features/admin/cms/homepage-section-preview";
import { buildCmsPreviewHref } from "@/lib/cms/preview-href";
import { cn } from "@/lib/utils";
import { validateSectionForPublish } from "@/lib/cms/section-validation";
import {
  CMS_SHELF_KEY_TO_ID,
  padShelfSlugs,
  resolveEffectiveShelfSlugs
} from "@/lib/home/shelf-product-resolution";
import { resolveShelfSlotAssignments } from "@/lib/cms/homepage-slot-assignment";
import { resolveMissionEditorState } from "@/lib/home/homepage-resolution";
import type { ShelfSlotProductItem } from "@/lib/admin/shelf-slot-product";
import type { ProductPageReview } from "@/lib/product-reviews/types";
import { CmsSyncErrorPanel } from "@/components/admin/cms/cms-sync-error-panel";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";

const timedSaveHomepageMissionFormAction = wrapServerAction(saveHomepageMissionFormAction, { label: "Save homepage mission" });
const timedSaveHomepageTestimonialsHeaderFormAction = wrapServerAction(saveHomepageTestimonialsHeaderFormAction, { label: "Save testimonials header" });
const timedSaveHomepageV2SectionFormAction = wrapServerAction(saveHomepageV2SectionFormAction, { label: "Save homepage section" });

/** Reports nested form pending into the section editor action bar. Must render inside a <form>. */
function CmsFormPendingReporter({ onPendingChange }: { onPendingChange: (pending: boolean) => void }) {
  const { pending } = useFormStatus();
  useEffect(() => {
    onPendingChange(pending);
  }, [onPendingChange, pending]);
  return null;
}

type HeroRecord = {
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

export type CmsSectionEditorProps = {
  sectionId: HomepageSectionId;
  homepageContent: HomepageCmsContent;
  homepageV2: HomepageCmsV2Content;
  heroBanners: HeroRecord[];
  mediaAssets: CmsMediaAssetOption[];
  products: Product[];
  effectiveProductSlugs?: string[];
  effectiveSlotProducts?: Array<ShelfSlotProductItem | null>;
  browseCatalog?: ShelfSlotProductItem[];
  shelfCategoryHint?: string;
  productReviews?: ProductPageReview[];
  syncError?: string | null;
};

function shelfKeyToForm(shelfKey: "droneWorld" | "droneCare" | "globalProducts") {
  return shelfKey;
}

export function CmsSectionEditor({
  sectionId,
  homepageContent,
  homepageV2,
  heroBanners,
  products,
  effectiveProductSlugs,
  effectiveSlotProducts,
  browseCatalog = [],
  shelfCategoryHint,
  productReviews = [],
  syncError = null
}: CmsSectionEditorProps) {
  const definition = getHomepageSectionDefinition(sectionId);
  const realtime = useOptionalAdminRealtime();
  const formRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "draft-saved" | "published" | "unsaved">("idle");
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [isFormPending, setIsFormPending] = useState(false);
  const onFormPendingChange = useCallback((pending: boolean) => {
    setIsFormPending(pending);
  }, []);
  const [productSlugs, setProductSlugs] = useState<string[]>(() => {
    const shelfKey = shelfKeyFromSectionId(sectionId);
    if (!shelfKey) return [];
    if (effectiveProductSlugs?.length) {
      return padShelfSlugs(effectiveProductSlugs, SHELF_PRODUCT_CARD_SLOTS);
    }
    const shelf = homepageContent.shelves[shelfKey];
    const stored = shelf.productSlugs;
    const shelfId = CMS_SHELF_KEY_TO_ID[shelfKey];
    const effective = resolveEffectiveShelfSlugs(shelfId, shelf, products, SHELF_PRODUCT_CARD_SLOTS);
    return stored.length ? padShelfSlugs(stored, SHELF_PRODUCT_CARD_SLOTS) : effective;
  });
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [isInferredAssignment, setIsInferredAssignment] = useState(() => {
    const shelfKey = shelfKeyFromSectionId(sectionId);
    return shelfKey ? homepageContent.shelves[shelfKey].productSlugs.length === 0 : false;
  });

  const uploadImage = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.set("files", file);
    formData.set("bucket", "mithron-products");
    formData.set("folder", "cms");
    formData.set("usage_scope", "cms");
    const result = await uploadCmsFieldImageAction(formData);
    if (!result.ok || !result.src) {
      return null;
    }
    return { src: result.src, alt: result.alt };
  }, []);

  const previewHref = useMemo(
    () => buildCmsPreviewHref({ anchor: definition?.previewAnchor ?? sectionId, draft: true }),
    [definition?.previewAnchor, sectionId]
  );

  const markDirty = useCallback(() => {
    setIsDirty(true);
    setSaveStatus("unsaved");
  }, []);

  const shouldReconcileOnSaveRef = useRef(false);

  const markSaved = useCallback(() => {
    setIsDirty(false);
    setSaveStatus("draft-saved");
    setPreviewRefreshKey((current) => current + 1);
    if (shouldReconcileOnSaveRef.current) {
      shouldReconcileOnSaveRef.current = false;
      markControlPlaneLiveSyncFlush();
      void realtime?.reconcileResources(["cms"]);
    }
  }, [realtime]);

  const discardChanges = useCallback(() => {
    setIsDirty(false);
    markControlPlaneLiveSyncFlush();
    void realtime?.reconcileResources(["cms"]);
  }, [realtime]);

  const saveDraft = useCallback((options?: { refresh?: boolean }) => {
    shouldReconcileOnSaveRef.current = options?.refresh === true;
    const form = formRef.current?.querySelector("form");
    form?.requestSubmit();
  }, []);

  // Debounced auto-save to draft so the live preview iframe stays close to editor state.
  // Autosave intentionally skips reconcile — only publish / explicit save sync the admin store.
  // Skip while a form/server action is already in flight to avoid stacked submits.
  useEffect(() => {
    if (!isDirty || isFormPending || isPending || definition?.editorKind === "hero-carousel" || definition?.editorKind === "footer-view") {
      return;
    }
    const timer = window.setTimeout(() => {
      saveDraft();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [isDirty, isFormPending, isPending, definition?.editorKind, saveDraft]);

  const handlePublish = useCallback(() => {
    startTransition(async () => {
      const form = formRef.current?.querySelector("form");
      const formData = form ? new FormData(form) : undefined;
      const isV1 =
        sectionId.startsWith("shelf-") ||
        sectionId.startsWith("mission-") ||
        sectionId === "testimonials";
      const result = await raceWithTimeout(
        isV1
          ? sectionId === "testimonials" && formData
            ? publishHomepageSectionClientAction(sectionId, formData)
            : publishHomepageV1ClientAction()
          : formData
            ? publishHomepageSectionClientAction(sectionId, formData)
            : publishHomepageV2ClientAction(),
        undefined,
        "Publish homepage section"
      );
      if (result.ok) {
        setIsDirty(false);
        setSaveStatus("published");
        setPreviewRefreshKey((current) => current + 1);
        markControlPlaneLiveSyncFlush();
        void realtime?.reconcileResources(["cms"]);
        notify.success(FEEDBACK_MESSAGES.changesSaved, { source: "cms", id: "cms:publish" });
        return;
      }
      notify.error(result.message || FEEDBACK_MESSAGES.failedToSaveChanges, { source: "cms", id: "cms:publish:error" });
    });
  }, [realtime, sectionId]);

  const showFormActions = definition?.editorKind !== "footer-view" && definition?.editorKind !== "hero-carousel";
  const usesV2Publish = definition?.workflow === "draft-publish" || definition?.workflow === "live-with-draft";
  const publishLabel = "Publish";
  const validation = useMemo(() => {
    if (!definition) return { valid: true, errors: [] };
    const shelfKey = shelfKeyFromSectionId(sectionId);
    if (shelfKey) {
      return validateSectionForPublish("product-shelf", {
        title: homepageContent.shelves[shelfKey].title,
        productSlugs: productSlugs.filter(Boolean)
      });
    }
    const interIndex = interShelfBannerIndex(sectionId);
    if (interIndex !== null) {
      const banner = homepageV2.banners.interShelf[interIndex];
      return validateSectionForPublish("inter-shelf-banner", banner);
    }
    const fullIndex = fullViewportBannerIndex(sectionId);
    if (fullIndex !== null) {
      return validateSectionForPublish("full-viewport-banner", homepageV2.banners.fullViewport[fullIndex]);
    }
    if (definition.editorKind === "mini-carousel") {
      return validateSectionForPublish("mini-carousel", homepageV2.miniCarousel);
    }
    if (definition.editorKind === "related-articles") {
      // Article cards are edited in /admin/blog; this section is a pointer only.
      return { valid: true, errors: [] };
    }
    if (definition.editorKind === "reviews-section") {
      return validateSectionForPublish("reviews-section", homepageContent.testimonials);
    }
    return { valid: true, errors: [] };
  }, [definition, homepageContent, homepageV2, productSlugs, sectionId]);

  if (!definition) {
    return <p className="text-sm text-[var(--platform-text-muted)]">Section not found.</p>;
  }

  const editor = (() => {
    if (definition.editorKind === "hero-carousel") {
      return (
        <HeroCarouselSlideEditor
          heroes={heroBanners}
          device={device}
          onDeviceChange={setDevice}
          onUpload={uploadImage}
        />
      );
    }

    const shelfKey = shelfKeyFromSectionId(sectionId);
    if (shelfKey && definition.editorKind === "product-shelf") {
      const shelf = homepageContent.shelves[shelfKey];
      return (
        <ShelfSectionForm
          shelfKey={shelfKey}
          shelf={shelf}
          productSlugs={productSlugs}
          initialSlotProducts={effectiveSlotProducts ?? []}
          browseCatalog={browseCatalog}
          shelfCategoryHint={shelfCategoryHint}
          products={products}
          isInferredAssignment={isInferredAssignment}
          onProductSlugsChange={setProductSlugs}
          onInferredAssignmentChange={setIsInferredAssignment}
          onSyncWarning={setSyncWarning}
          onDirty={markDirty}
          onSaved={markSaved}
          onSavingChange={onFormPendingChange}
          uploadImage={uploadImage}
        />
      );
    }

    const missionKey = missionKeyFromSectionId(sectionId);
    if (missionKey && definition.editorKind === "mission-world") {
      const missionState = resolveMissionEditorState(missionKey, homepageContent);
      const mission = missionState.mission;
      return (
        <form action={timedSaveHomepageMissionFormAction} className="grid gap-4" onChange={markDirty}>
          <CmsFormPendingReporter onPendingChange={onFormPendingChange} />
          <input type="hidden" name="mission_key" value={missionKey} />
          <div className="grid gap-4 md:grid-cols-2">
            <CmsField label="Title" name="title" defaultValue={mission.title} />
            <CmsField label="Eyebrow" name="eyebrow" defaultValue={mission.eyebrow} />
            <CmsField label="Primary CTA" name="cta" defaultValue={mission.cta} />
            <CmsField label="Section link" name="href" defaultValue={mission.href} />
          </div>
          <CmsTextAreaField label="Intro body" name="body" defaultValue={mission.body} />
          <MissionTileEditor tiles={mission.tiles} onDirty={markDirty} />
        </form>
      );
    }

    if (definition.editorKind === "mini-carousel") {
      const handlePinMiniCarousel = () => {
        startTransition(async () => {
          const result = await raceWithTimeout(
            pinMiniCarouselDraftClientAction(),
            undefined,
            "Pin mini carousel"
          );
          if (result.ok) {
            setSaveStatus("draft-saved");
            setPreviewRefreshKey((current) => current + 1);
            markControlPlaneLiveSyncFlush();
            void realtime?.reconcileResources(["cms"]);
            notify.success(FEEDBACK_MESSAGES.changesSaved, { source: "cms", id: "cms:pin-carousel" });
            return;
          }
          notify.error(result.message || FEEDBACK_MESSAGES.failedToSaveChanges, { source: "cms", id: "cms:pin-carousel:error" });
        });
      };

      return (
        <MiniCarouselSlotEditor
          enabled={homepageV2.miniCarousel.enabled}
          slides={homepageV2.miniCarousel.slides}
          products={products}
          browseCatalog={browseCatalog}
          onDirty={markDirty}
          onPendingChange={onFormPendingChange}
          onPinRequest={handlePinMiniCarousel}
        />
      );
    }

    const interIndex = interShelfBannerIndex(sectionId);
    if (interIndex !== null && definition.editorKind === "inter-shelf-banner") {
      const banner = homepageV2.banners.interShelf[interIndex];
      return (
        <V2BannerForm
          sectionKey={`banner-inter-shelf-${interIndex + 1}`}
          banner={banner}
          spec={CMS_IMAGE_SPECS.interShelfBanner}
          onDirty={markDirty}
          onPendingChange={onFormPendingChange}
          onUpload={uploadImage}
        />
      );
    }

    const fullIndex = fullViewportBannerIndex(sectionId);
    if (fullIndex !== null && definition.editorKind === "full-viewport-banner") {
      return (
        <FullViewportBannerForm
          sectionKey={`banner-full-viewport-${fullIndex + 1}`}
          banner={homepageV2.banners.fullViewport[fullIndex]}
          onDirty={markDirty}
          onPendingChange={onFormPendingChange}
          onUpload={uploadImage}
        />
      );
    }

    if (definition.editorKind === "related-articles") {
      return (
        <div className="grid gap-4 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-5">
          <p className="text-sm leading-relaxed text-[var(--platform-text-secondary)]">
            Article cards (heading, image, redirect link) are edited in the Articles panel so there is only one place to manage them.
          </p>
          <Link href="/admin/blog" className="platform-btn-primary inline-flex w-fit items-center justify-center rounded-lg px-4 py-2 text-sm font-medium">
            Open Articles
          </Link>
        </div>
      );
    }

    if (definition.editorKind === "reviews-section") {
      return (
        <div className="grid gap-4">
          <div className="rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-5">
            <p className="text-sm leading-relaxed text-[var(--platform-text-secondary)]">
              Customer reviews (name, product, description) are managed in the Reviews panel.
            </p>
            <Link href="/admin/reviews" className="platform-btn-primary mt-3 inline-flex w-fit items-center justify-center rounded-lg px-4 py-2 text-sm font-medium">
              Open Reviews
            </Link>
          </div>
          <form action={timedSaveHomepageTestimonialsHeaderFormAction} className="grid gap-4" onChange={markDirty}>
            <CmsFormPendingReporter onPendingChange={onFormPendingChange} />
            <div className="grid gap-4 md:grid-cols-2">
              <CmsField label="Heading" name="title" defaultValue={homepageContent.testimonials.title} />
              <CmsField label="Accent phrase" name="title_accent" defaultValue={homepageContent.testimonials.titleAccent} />
              <CmsField label="Eyebrow" name="eyebrow" defaultValue={homepageContent.testimonials.eyebrow} />
              <CmsField label="Browse link label" name="link_label" defaultValue={homepageContent.testimonials.linkLabel} />
              <CmsField label="Browse link" name="link_href" defaultValue={homepageContent.testimonials.linkHref} />
            </div>
            <CmsTextAreaField label="Description" name="lead" defaultValue={homepageContent.testimonials.lead} />
            <button type="submit" className={cmsPrimaryButtonClass()}>Save section header</button>
          </form>
          <form action={timedSaveHomepageV2SectionFormAction} className="grid gap-4 rounded-[var(--platform-radius)] border border-[var(--platform-border)] p-4" onChange={markDirty}>
            <CmsFormPendingReporter onPendingChange={onFormPendingChange} />
            <input type="hidden" name="section_key" value="reviews" />
            <CmsField label="Max reviews shown" name="max_count" defaultValue={String(homepageV2.reviews.maxCount)} type="number" />
            <CmsSelectField
              label="Sort order"
              name="sort_order"
              defaultValue={homepageV2.reviews.sortOrder}
              options={[
                { value: "newest", label: "Newest" },
                { value: "rating", label: "Highest rating" },
                { value: "manual", label: "Manual" }
              ]}
            />
            <button type="submit" className={cmsPrimaryButtonClass()}>Save review settings</button>
          </form>
        </div>
      );
    }

    return (
      <div className="rounded-[var(--platform-radius)] border border-dashed border-[var(--platform-border)] p-6 text-sm text-[var(--platform-text-secondary)]">
        Footer content is edited in the footer workspace.
        <Link href="/admin/cms?page=footer-page" className="mt-2 block font-semibold text-[var(--platform-accent)]">
          Open footer editor
        </Link>
      </div>
    );
  })();

  const shelfKey = shelfKeyFromSectionId(sectionId);
  const initialShelfSlugs = shelfKey ? { [shelfKey]: productSlugs } : {};

  return (
    <HomepageBuilderProvider
      sectionId={sectionId}
      homepageCms={homepageContent}
      homepageV2={homepageV2}
      products={products}
      shelfProductSlugs={initialShelfSlugs}
    >
      <div data-cms-section-editor={sectionId} className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <HomepageBuilderNav activeSectionId={sectionId} />

        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/admin/cms" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--platform-text-secondary)] hover:text-[var(--platform-text-primary)]">
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Homepage Builder
            </Link>
          </div>

          <BuilderValidationBanner errors={validation.errors} />
          {syncError ? <CmsSyncErrorPanel message={syncError} /> : null}
          {syncWarning ? (
            <div className="rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">
              {syncWarning}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)]">
            <CmsEditorActionBar
              sectionLabel={getBuilderSectionLabel(sectionId)}
              isDirty={isDirty}
              isSaving={isPending || isFormPending}
              saveStatus={saveStatus}
              publishDisabled={isDirty || !validation.valid}
              previewHref={previewHref}
              onDiscard={showFormActions ? discardChanges : undefined}
              onSaveDraft={showFormActions ? () => saveDraft({ refresh: true }) : undefined}
              onPublish={usesV2Publish && definition.editorKind !== "footer-view" ? handlePublish : undefined}
              publishLabel={publishLabel}
            />
            <HomepageBuilderWorkspace
              device={device}
              onDeviceChange={setDevice}
              editor={<div ref={formRef}>{editor}</div>}
              sectionPreview={
                <HomepageSectionPreview
                  sectionId={sectionId}
                  homepageCms={homepageContent}
                  homepageV2={homepageV2}
                  products={products}
                  productReviews={productReviews}
                  shelfProductSlugs={productSlugs}
                  syncError={syncError}
                />
              }
              fullPagePreview={
                <CmsLivePreviewPanel
                  previewHref={previewHref}
                  device={device}
                  onDeviceChange={setDevice}
                  refreshKey={previewRefreshKey}
                  embedded
                />
              }
            />
          </div>
        </div>
      </div>
    </HomepageBuilderProvider>
  );
}

function V2BannerForm({
  sectionKey,
  banner,
  spec,
  onDirty,
  onPendingChange,
  onUpload
}: {
  sectionKey: string;
  banner: {
    enabled: boolean;
    heading: string;
    subtitle: string;
    ctaLabel: string;
    href: string;
    imageSrc: string;
    imageAlt: string;
    overlayOpacity: number;
    alignment: string;
  };
  spec: (typeof CMS_IMAGE_SPECS)[keyof typeof CMS_IMAGE_SPECS];
  onDirty?: () => void;
  onPendingChange?: (pending: boolean) => void;
  onUpload?: (file: File) => Promise<{ src: string; alt?: string } | null>;
}) {
  const [previewSrc, setPreviewSrc] = useState(banner.imageSrc);
  const [bannerDevice, setBannerDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  return (
    <form action={timedSaveHomepageV2SectionFormAction} className="grid gap-4" onChange={() => onDirty?.()}>
      {onPendingChange ? <CmsFormPendingReporter onPendingChange={onPendingChange} /> : null}
      <input type="hidden" name="section_key" value={sectionKey} />
      <div className="grid gap-4 md:grid-cols-2">
        <CmsField label="Heading" name="heading" defaultValue={banner.heading} />
        <CmsField label="Subtitle" name="subtitle" defaultValue={banner.subtitle} />
        <CmsField label="CTA label" name="cta_label" defaultValue={banner.ctaLabel} />
        <CmsField label="Link" name="href" defaultValue={banner.href} />
        <CmsField label="Overlay opacity" name="overlay_opacity" defaultValue={String(banner.overlayOpacity)} />
        <CmsSelectField
          label="Alignment"
          name="alignment"
          defaultValue={banner.alignment}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" }
          ]}
        />
      </div>
      <CmsImageField
        label="Banner image"
        name="image_src"
        altName="image_alt"
        defaultValue={banner.imageSrc}
        defaultAlt={banner.imageAlt}
        spec={spec}
        onUpload={onUpload}
        onPreviewChange={setPreviewSrc}
      />
      <BannerImagePreview imageSrc={previewSrc} device={bannerDevice} onDeviceChange={setBannerDevice} spec={spec} />
      <input type="hidden" name="enabled" value={banner.enabled ? "true" : "false"} />
    </form>
  );
}

function FullViewportBannerForm({
  sectionKey,
  banner,
  onDirty,
  onPendingChange,
  onUpload
}: {
  sectionKey: string;
  banner: HomepageCmsV2Content["banners"]["fullViewport"][number];
  onDirty?: () => void;
  onPendingChange?: (pending: boolean) => void;
  onUpload?: (file: File) => Promise<{ src: string; alt?: string } | null>;
}) {
  const [desktopPreview, setDesktopPreview] = useState(banner.desktopImageSrc);
  const [mobilePreview, setMobilePreview] = useState(banner.mobileImageSrc);
  const mobileSpec = {
    ...CMS_IMAGE_SPECS.fullViewport,
    label: "Full viewport mobile banner",
    requiredWidth: 1080,
    requiredHeight: 1920,
    recommendedWidth: 1080,
    recommendedHeight: 1920,
    minWidth: 720,
    minHeight: 1280,
    aspectRatio: "9:16"
  };

  return (
    <form action={timedSaveHomepageV2SectionFormAction} className="grid gap-5" onChange={() => onDirty?.()}>
      {onPendingChange ? <CmsFormPendingReporter onPendingChange={onPendingChange} /> : null}
      <input type="hidden" name="section_key" value={sectionKey} />
      <div className="grid gap-4 md:grid-cols-2">
        <CmsField label="Heading" name="heading" defaultValue={banner.heading} />
        <CmsField label="Subtitle" name="subtitle" defaultValue={banner.subtitle} />
        <CmsField label="CTA label" name="cta_label" defaultValue={banner.ctaLabel} />
        <CmsField label="Link" name="href" defaultValue={banner.href} />
        <CmsField label="Overlay opacity" name="overlay_opacity" defaultValue={String(banner.overlayOpacity)} />
        <CmsSelectField
          label="Alignment"
          name="alignment"
          defaultValue={banner.alignment}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" }
          ]}
        />
      </div>
      <CmsImageField
        label="Desktop banner"
        name="desktop_image_src"
        altName="desktop_image_alt"
        defaultValue={banner.desktopImageSrc}
        defaultAlt={banner.desktopImageAlt}
        spec={CMS_IMAGE_SPECS.fullViewport}
        onUpload={onUpload}
        onPreviewChange={setDesktopPreview}
      />
      <CmsImageField
        label="Mobile banner"
        name="mobile_image_src"
        altName="mobile_image_alt"
        defaultValue={banner.mobileImageSrc}
        defaultAlt={banner.mobileImageAlt}
        spec={mobileSpec}
        onUpload={onUpload}
        onPreviewChange={setMobilePreview}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <BannerImagePreview imageSrc={desktopPreview} device="desktop" spec={CMS_IMAGE_SPECS.fullViewport} />
        <BannerImagePreview imageSrc={mobilePreview || desktopPreview} device="mobile" spec={mobileSpec} />
      </div>
      <input type="hidden" name="enabled" value={banner.enabled ? "true" : "false"} />
    </form>
  );
}

function ShelfSectionForm({
  shelfKey,
  shelf,
  productSlugs,
  initialSlotProducts,
  browseCatalog,
  shelfCategoryHint,
  products,
  isInferredAssignment,
  onProductSlugsChange,
  onInferredAssignmentChange,
  onSyncWarning,
  onDirty,
  onSaved,
  onSavingChange,
  uploadImage
}: {
  shelfKey: keyof HomepageCmsContent["shelves"];
  shelf: HomepageShelfCms;
  productSlugs: string[];
  initialSlotProducts: Array<ShelfSlotProductItem | null>;
  browseCatalog: ShelfSlotProductItem[];
  shelfCategoryHint?: string;
  products: Product[];
  isInferredAssignment: boolean;
  onProductSlugsChange: (slugs: string[]) => void;
  onInferredAssignmentChange: (value: boolean) => void;
  onSyncWarning: (message: string | null) => void;
  onDirty: () => void;
  onSaved: () => void;
  onSavingChange?: (pending: boolean) => void;
  uploadImage: (file: File) => Promise<{ src: string; alt?: string } | null>;
}) {
  const builder = useOptionalHomepageBuilder();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSaving, startTransition] = useTransition();
  const slotAssignments = useMemo(
    () => resolveShelfSlotAssignments(CMS_SHELF_KEY_TO_ID[shelfKey], shelf, products),
    [products, shelf, shelfKey]
  );

  useEffect(() => {
    onSavingChange?.(isSaving);
  }, [isSaving, onSavingChange]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await raceWithTimeout(
          saveHomepageShelfClientAction(formData),
          undefined,
          "Save homepage shelf"
        );
        if (result.ok) {
          onInferredAssignmentChange(false);
          onSaved();
          notify.success(FEEDBACK_MESSAGES.changesSaved, { source: "cms", id: "cms:shelf-save" });
          return;
        }
        notify.error(result.message || FEEDBACK_MESSAGES.failedToSaveChanges, { source: "cms", id: "cms:shelf-save:error" });
      } catch (error) {
        notify.error(
          error instanceof Error ? error.message : FEEDBACK_MESSAGES.failedToSaveChanges,
          { source: "cms", id: "cms:shelf-save:error" }
        );
      }
    });
  };

  return (
    <form className="flex flex-col gap-6" onChange={onDirty} onSubmit={handleSubmit}>
      <input type="hidden" name="shelf_key" value={shelfKeyToForm(shelfKey)} />
      <input type="hidden" name="product_count" value={String(SHELF_PRODUCT_CARD_SLOTS)} />
      <ShelfProductReplaceEditor
        slotCount={SHELF_PRODUCT_CARD_SLOTS}
        selectedSlugs={productSlugs}
        initialSlotProducts={initialSlotProducts}
        browseCatalog={browseCatalog}
        shelfCategoryHint={shelfCategoryHint}
        isInferredAssignment={isInferredAssignment}
        slotSources={slotAssignments.map((slot) => slot.source)}
        onSyncWarning={onSyncWarning}
        onChange={(slugs) => {
          onProductSlugsChange(slugs);
          builder?.setShelfSlugs(shelfKey, slugs);
          onDirty();
        }}
      />

      <details
        open={settingsOpen}
        onToggle={(event) => setSettingsOpen((event.currentTarget as HTMLDetailsElement).open)}
        className="rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--platform-text-primary)] [&::-webkit-details-marker]:hidden">
          <span>Shelf settings</span>
          <ChevronDown className={cn("size-4 shrink-0 transition", settingsOpen && "rotate-180")} aria-hidden="true" />
        </summary>
        <div className="grid gap-5 border-t border-[var(--platform-border)] px-4 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <CmsField label="Section title" name="title" defaultValue={shelf.title} />
            <CmsField label="Eyebrow" name="eyebrow" defaultValue={shelf.eyebrow} />
            <CmsField label="Banner description" name="hero_body" defaultValue={shelf.heroBody} />
            <CmsField label="Banner CTA" name="feature_cta" defaultValue={shelf.featureCta} />
          </div>
          <CmsImageField
            label="Shelf banner image"
            name="hero_image_src"
            altName="hero_image_alt"
            defaultValue={shelf.heroImageSrc}
            defaultAlt={shelf.heroImageAlt}
            spec={CMS_IMAGE_SPECS.shelfBanner}
            onUpload={uploadImage}
          />
        </div>
      </details>
    </form>
  );
}
