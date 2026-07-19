"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type MutableRefObject
} from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { markControlPlaneLiveSyncFlush } from "@/lib/control-plane/shared-live-sync-coordinator";
import { editorHtmlToPlainText } from "@/lib/editor/prepare-html";
import {
  pinMiniCarouselDraftClientAction,
  publishHomepageSectionClientAction,
  publishHomepageV1ClientAction,
  publishHomepageV2ClientAction,
  saveHomepageMissionClientAction,
  saveHomepageShelfClientAction,
  saveHomepageV2SectionClientAction,
  uploadCmsFieldImageAction
} from "@/app/admin/cms/actions";
import { CmsField, CmsTextAreaField } from "@/components/admin/cms/cms-field";
import { CmsImageField } from "@/components/admin/cms/cms-image-field";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { HeroCarouselSlideEditor } from "@/components/admin/cms/hero-carousel-slide-editor";
import { MiniCarouselSlotEditor } from "@/components/admin/cms/mini-carousel-slot-editor";
import { MissionTileEditor } from "@/components/admin/cms/mission-tile-editor";
import { ShelfProductReplaceEditor } from "@/components/admin/cms/shelf-product-replace-editor";
import { TestimonialsSectionEditor } from "@/components/admin/cms/testimonials-section-editor";
import { RelatedArticlesSectionEditor } from "@/components/admin/cms/related-articles-section-editor";
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
import { HomepageBuilderProvider, useHomepageBuilder, useOptionalHomepageBuilder } from "@/features/admin/cms/homepage-builder-context";
import { HomepageBuilderWorkspace } from "@/features/admin/cms/homepage-builder-workspace";
import { HomepageBuilderNav } from "@/features/admin/cms/homepage-builder-nav";
import { buildCmsPreviewHref } from "@/lib/cms/preview-href";
import { cn } from "@/lib/utils";
import { validateSectionForPublish } from "@/lib/cms/section-validation";
import type { HomepageOutlineSectionStatus } from "@/lib/cms/section-content-status";
import {
  CMS_SHELF_KEY_TO_ID,
  padShelfSlugs,
  resolveEffectiveShelfSlugs
} from "@/lib/home/shelf-product-resolution";
import { resolveClientShelfSlotSources } from "@/lib/cms/homepage-slot-assignment";
import { resolveMissionEditorState } from "@/lib/home/homepage-resolution";
import { getHomepageShelfCatalogHref } from "@/lib/catalog-categories";
import type { ShelfSlotProductItem } from "@/lib/admin/shelf-slot-product";
import { CmsSyncErrorPanel } from "@/components/admin/cms/cms-sync-error-panel";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";

type ClientActionResult = { ok: boolean; message: string };

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.digest === "string") return record.digest;
  }
  return String(error ?? "");
}

function isStaleServerActionError(error: unknown) {
  const message = errorMessage(error);
  if (/failed to find server action/i.test(message)) return true;
  if (/server action/i.test(message) && /not found/i.test(message)) return true;
  if (/was not found on the server/i.test(message)) return true;
  if (/NEXT_HTTP_ERROR_FALLBACK/i.test(message)) return true;
  // Next sometimes surfaces only the action id hash in the toast/message.
  if (/^[a-f0-9]{40,}$/i.test(message.trim())) return true;
  if (error && typeof error === "object" && "digest" in error) {
    const digest = String((error as { digest?: unknown }).digest ?? "");
    if (/NEXT_HTTP_ERROR_FALLBACK|SERVER_ACTION/i.test(digest)) return true;
  }
  return false;
}

let staleRecoveryScheduled = false;

function recoverStaleServerAction(notifyId: string) {
  if (staleRecoveryScheduled) return;
  staleRecoveryScheduled = true;
  notify.error("Editor out of date — refreshing…", { source: "cms", id: `${notifyId}:stale-action` });
  window.setTimeout(() => {
    window.location.reload();
  }, 500);
}

async function runCmsClientSave(
  action: (formData: FormData) => Promise<ClientActionResult>,
  formData: FormData,
  label: string,
  notifyId: string
): Promise<boolean> {
  try {
    const result = await raceWithTimeout(action(formData), undefined, label);
    if (result.ok) {
      notify.success(result.message || FEEDBACK_MESSAGES.changesSaved, { source: "cms", id: notifyId });
      return true;
    }
    notify.error(result.message || FEEDBACK_MESSAGES.failedToSaveChanges, {
      source: "cms",
      id: `${notifyId}:error`
    });
    return false;
  } catch (error) {
    if (isStaleServerActionError(error)) {
      recoverStaleServerAction(notifyId);
      return false;
    }
    notify.error(
      error instanceof Error ? error.message : FEEDBACK_MESSAGES.failedToSaveChanges,
      { source: "cms", id: `${notifyId}:error` }
    );
    return false;
  }
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
  syncError?: string | null;
  sectionStatus?: Partial<Record<HomepageSectionId, HomepageOutlineSectionStatus>>;
};

function shelfKeyToForm(shelfKey: "droneWorld" | "droneCare" | "globalProducts") {
  return shelfKey;
}

function BuilderDraftResetBridge({ onReady }: { onReady: (reset: () => void) => void }) {
  const { resetDraft } = useHomepageBuilder();
  useEffect(() => {
    onReady(resetDraft);
  }, [onReady, resetDraft]);
  return null;
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
  syncError = null,
  sectionStatus
}: CmsSectionEditorProps) {
  const definition = getHomepageSectionDefinition(sectionId);
  const router = useRouter();
  const formRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const lastSuccessfulSaveAtRef = useRef(0);
  const isFormPendingRef = useRef(false);
  const isPendingRef = useRef(false);
  const builderResetRef = useRef<(() => void) | null>(null);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [isDirty, setIsDirty] = useState(false);
  const [formRevision, setFormRevision] = useState(0);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "published" | "unsaved">("idle");
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const sectionShellRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isFormPending, setIsFormPending] = useState(false);
  isPendingRef.current = isPending;
  isFormPendingRef.current = isFormPending;

  const markSuccessfulCmsWrite = useCallback(() => {
    lastSuccessfulSaveAtRef.current = Date.now();
  }, []);

  const onFormPendingChange = useCallback((pending: boolean) => {
    isFormPendingRef.current = pending;
    setIsFormPending(pending);
  }, []);

  const resolveInitialProductSlugs = useCallback(() => {
    const shelfKey = shelfKeyFromSectionId(sectionId);
    if (!shelfKey) return [] as string[];
    const shelf = homepageContent.shelves[shelfKey];
    const stored = shelf.productSlugs;
    if (stored.length) return padShelfSlugs(stored, SHELF_PRODUCT_CARD_SLOTS);
    if (effectiveProductSlugs?.length) {
      return padShelfSlugs(effectiveProductSlugs, SHELF_PRODUCT_CARD_SLOTS);
    }
    const shelfId = CMS_SHELF_KEY_TO_ID[shelfKey];
    return resolveEffectiveShelfSlugs(shelfId, shelf, products, SHELF_PRODUCT_CARD_SLOTS);
  }, [effectiveProductSlugs, homepageContent.shelves, products, sectionId]);

  const [productSlugs, setProductSlugs] = useState<string[]>(() => resolveInitialProductSlugs());
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
    setFormRevision((current) => current + 1);
  }, []);

  useLayoutEffect(() => {
    const measureChrome = () => {
      const shell = sectionShellRef.current;
      if (!shell) return;
      const top = Math.max(0, Math.round(shell.getBoundingClientRect().top));
      document.documentElement.style.setProperty("--cms-chrome-offset", `${top}px`);
    };
    measureChrome();
    const shell = sectionShellRef.current;
    const observer =
      typeof ResizeObserver !== "undefined" && shell
        ? new ResizeObserver(() => measureChrome())
        : null;
    observer?.observe(document.documentElement);
    if (shell) observer?.observe(shell);
    window.addEventListener("resize", measureChrome);
    window.addEventListener("scroll", measureChrome, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureChrome);
      window.removeEventListener("scroll", measureChrome);
    };
  }, [sectionId]);

  const shouldReconcileOnSaveRef = useRef(false);

  const markSaved = useCallback(() => {
    setIsDirty(false);
    setSaveStatus("saved");
    markSuccessfulCmsWrite();
    setPreviewRefreshKey((current) => current + 1);
    if (shouldReconcileOnSaveRef.current) {
      shouldReconcileOnSaveRef.current = false;
      markControlPlaneLiveSyncFlush();
    }
    router.refresh();
  }, [markSuccessfulCmsWrite, router]);

  const saveSection = useCallback((options?: { refresh?: boolean }) => {
    if (inFlightRef.current || isFormPendingRef.current || isPendingRef.current) return;
    shouldReconcileOnSaveRef.current = options?.refresh === true;
    const form = formRef.current?.querySelector("form");
    form?.requestSubmit();
  }, []);

  const handlePublish = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsFormPending(true);
    startTransition(async () => {
      try {
        const form = formRef.current?.querySelector("form");
        const formData = form ? new FormData(form) : undefined;
        const isV1 =
          sectionId.startsWith("shelf-") ||
          sectionId.startsWith("mission-") ||
          sectionId === "testimonials";
        const isMission = Boolean(missionKeyFromSectionId(sectionId));
        const isShelf = Boolean(shelfKeyFromSectionId(sectionId));
        const isV2Section = !isV1;
        const shelfNeedsPersist = isShelf && (isDirty || isInferredAssignment);
        const missionNeedsPersist = isMission && Boolean(formData);
        const v2NeedsPersist = isV2Section && Boolean(formData) && isDirty;

        if (shelfNeedsPersist && formData) {
          const saveResult = await raceWithTimeout(
            saveHomepageShelfClientAction(formData),
            undefined,
            "Save homepage shelf before publish"
          );
          if (!saveResult.ok) {
            notify.error(saveResult.message || FEEDBACK_MESSAGES.failedToSaveChanges, {
              source: "cms",
              id: "cms:publish:presave:error"
            });
            return;
          }
          setIsInferredAssignment(false);
          markSuccessfulCmsWrite();
        }

        if (missionNeedsPersist && formData) {
          const saveResult = await raceWithTimeout(
            saveHomepageMissionClientAction(formData),
            undefined,
            "Save homepage mission before publish"
          );
          if (!saveResult.ok) {
            notify.error(saveResult.message || FEEDBACK_MESSAGES.failedToSaveChanges, {
              source: "cms",
              id: "cms:publish:presave:error"
            });
            return;
          }
          markSuccessfulCmsWrite();
        }

        if (v2NeedsPersist && formData) {
          const saveResult = await raceWithTimeout(
            saveHomepageV2SectionClientAction(formData),
            undefined,
            "Save homepage section before publish"
          );
          if (!saveResult.ok) {
            notify.error(saveResult.message || FEEDBACK_MESSAGES.failedToSaveChanges, {
              source: "cms",
              id: "cms:publish:presave:error"
            });
            return;
          }
          markSuccessfulCmsWrite();
        }

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
          markSuccessfulCmsWrite();
          setPreviewRefreshKey((current) => current + 1);
          markControlPlaneLiveSyncFlush();
          notify.success(result.message || "Published to the live homepage.", { source: "cms", id: "cms:publish" });
          router.refresh();
          return;
        }
        notify.error(result.message || FEEDBACK_MESSAGES.failedToSaveChanges, { source: "cms", id: "cms:publish:error" });
      } catch (error) {
        if (isStaleServerActionError(error)) {
          recoverStaleServerAction("cms:publish");
          return;
        }
        notify.error(
          error instanceof Error ? error.message : FEEDBACK_MESSAGES.failedToSaveChanges,
          { source: "cms", id: "cms:publish:error" }
        );
      } finally {
        inFlightRef.current = false;
        setIsFormPending(false);
      }
    });
  }, [isDirty, isInferredAssignment, markSuccessfulCmsWrite, router, sectionId]);

  const showFormActions = definition?.editorKind !== "footer-view" && definition?.editorKind !== "hero-carousel";
  const usesV2Publish = definition?.workflow === "draft-publish" || definition?.workflow === "live-with-draft";
  const publishLabel = "Publish";
  const validation = useMemo(() => {
    if (!definition) return { valid: true, errors: [] as { field: string; message: string }[] };
    const root = formRef.current;
    const readLive = (name: string): string | null => {
      const el = root?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`);
      return el ? el.value.trim() : null;
    };
    const read = (name: string, fallback = "") => readLive(name) ?? fallback;

    const shelfKey = shelfKeyFromSectionId(sectionId);
    if (shelfKey) {
      const catalogSlugs = new Set(products.map((p) => p.slug));
      const orphanedSlugs = new Set(
        productSlugs.filter((slug) => slug && !catalogSlugs.has(slug))
      );
      return validateSectionForPublish("product-shelf", {
        title: read("title", homepageContent.shelves[shelfKey].title),
        productSlugs: productSlugs.filter(Boolean),
        orphanedSlugs
      });
    }


    const interIndex = interShelfBannerIndex(sectionId);
    if (interIndex !== null) {
      const banner = homepageV2.banners.interShelf[interIndex];
      return validateSectionForPublish("inter-shelf-banner", {
        heading: read("heading", banner.heading),
        imageSrc: read("image_src", banner.imageSrc),
        ctaLabel: read("cta_label", banner.ctaLabel),
        href: read("href", banner.href)
      });
    }

    const fullIndex = fullViewportBannerIndex(sectionId);
    if (fullIndex !== null) {
      const banner = homepageV2.banners.fullViewport[fullIndex];
      const imageSrc = read("desktop_image_src", banner.desktopImageSrc);
      return validateSectionForPublish("full-viewport-banner", {
        heading: read("heading", banner.heading),
        imageSrc,
        desktopImageSrc: imageSrc,
        ctaLabel: read("cta_label", banner.ctaLabel),
        href: read("href", banner.href)
      });
    }

    if (definition.editorKind === "mini-carousel") {
      const catalogSlugs = new Set(products.map((p) => p.slug));
      const orphanedSlugs = new Set(
        homepageV2.miniCarousel.slides
          .filter((slide) => slide.enabled !== false && slide.productSlug && !catalogSlugs.has(slide.productSlug))
          .map((slide) => slide.productSlug)
      );
      return validateSectionForPublish("mini-carousel", {
        ...homepageV2.miniCarousel,
        orphanedSlugs
      });
    }

    if (definition.editorKind === "related-articles") {
      const count = Number(read("article_count", String(homepageV2.relatedArticles.items.length)));
      const items = Array.from({ length: Number.isFinite(count) ? count : 0 }, (_, index) => {
        const fallback = homepageV2.relatedArticles.items[index];
        const enabledRaw = readLive(`article_${index}_enabled`);
        return {
          title: read(`article_${index}_title`, fallback?.title || ""),
          imageSrc: read(`article_${index}_image`, fallback?.imageSrc || ""),
          href: read(`article_${index}_href`, fallback?.href || ""),
          enabled: enabledRaw !== null ? enabledRaw === "true" : fallback?.enabled !== false
        };
      });
      return validateSectionForPublish("related-articles", {
        items: items.length ? items : homepageV2.relatedArticles.items
      });
    }

    if (definition.editorKind === "reviews-section") {
      const title = read("title", homepageContent.testimonials.title);
      const count = Number(read("card_count", String((homepageV2.testimonialCards ?? []).length)));
      const cards = Array.from({ length: Number.isFinite(count) ? count : 0 }, (_, index) => {
        const fallback = homepageV2.testimonialCards?.[index];
        const enabledRaw = readLive(`card_${index}_enabled`);
        const ratingLive = readLive(`card_${index}_rating`);
        return {
          authorName: read(`card_${index}_author_name`, fallback?.authorName || ""),
          body: read(`card_${index}_body`, fallback?.body || ""),
          rating: Number(ratingLive ?? fallback?.rating ?? 0),
          productSlug: read(`card_${index}_product_slug`, fallback?.productSlug || ""),
          hrefOverride: read(`card_${index}_href_override`, fallback?.hrefOverride || ""),
          enabled: enabledRaw !== null ? enabledRaw === "true" : fallback?.enabled !== false
        };
      });
      return validateSectionForPublish("reviews-section", {
        title,
        cards: cards.length ? cards : homepageV2.testimonialCards ?? []
      });
    }

    return { valid: true, errors: [] as { field: string; message: string }[] };
    // formRevision forces recompute so uncontrolled inputs are re-read from the DOM
  }, [definition, formRevision, homepageContent, homepageV2, productSlugs, sectionId]);

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
          key={`shelf-form-${editorEpoch}`}
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
          inFlightRef={inFlightRef}
          uploadImage={uploadImage}
        />
      );
    }

    const missionKey = missionKeyFromSectionId(sectionId);
    if (missionKey && definition.editorKind === "mission-world") {
      const missionState = resolveMissionEditorState(missionKey, homepageContent);
      const mission = missionState.mission;
      return (
        <MissionSectionForm
          missionKey={missionKey}
          mission={mission}
          onDirty={markDirty}
          onSaved={markSaved}
          onSavingChange={onFormPendingChange}
          uploadImage={uploadImage}
        />
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
            setSaveStatus("saved");
            setPreviewRefreshKey((current) => current + 1);
            markControlPlaneLiveSyncFlush();
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
          onSaved={markSaved}
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
          onSaved={markSaved}
          onPendingChange={onFormPendingChange}
          onUpload={uploadImage}
        />
      );
    }

    if (definition.editorKind === "related-articles") {
      return (
        <RelatedArticlesSectionEditor
          enabled={homepageV2.relatedArticles.enabled}
          items={homepageV2.relatedArticles.items}
          browseAllHref={homepageV2.relatedArticles.browseAllHref}
          sectionTitle={homepageV2.relatedArticles.sectionTitle}
          sectionLead={homepageV2.relatedArticles.sectionLead}
          onDirty={markDirty}
          onSaved={markSaved}
          onSavingChange={onFormPendingChange}
          uploadImage={uploadImage}
        />
      );
    }

    if (definition.editorKind === "reviews-section") {
      return (
        <TestimonialsSectionEditor
          header={homepageContent.testimonials}
          reviews={homepageV2.reviews}
          cards={homepageV2.testimonialCards ?? []}
          browseCatalog={browseCatalog}
          products={products}
          onDirty={markDirty}
          onSaved={markSaved}
          onSavingChange={onFormPendingChange}
          uploadImage={uploadImage}
        />
      );
    }

    return (
      <div className="rounded-[var(--platform-radius)] border border-dashed border-[var(--platform-border)] p-6 text-sm text-[var(--platform-text-secondary)]">
        This section is not edited in Homepage Builder.
        <Link href="/admin/cms" className="mt-2 block font-semibold text-[var(--platform-accent)]">
          Back to Homepage Builder
        </Link>
      </div>
    );
  })();

  const shelfKey = shelfKeyFromSectionId(sectionId);
  const initialShelfSlugs = shelfKey ? { [shelfKey]: productSlugs } : {};

  return (
    <HomepageBuilderProvider
      key={`${sectionId}-${editorEpoch}`}
      sectionId={sectionId}
      homepageCms={homepageContent}
      homepageV2={homepageV2}
      products={products}
      shelfProductSlugs={initialShelfSlugs}
    >
      <BuilderDraftResetBridge
        onReady={(reset) => {
          builderResetRef.current = reset;
        }}
      />
      <div
        ref={sectionShellRef}
        data-cms-section-editor={sectionId}
        className="grid min-h-0 flex-1 grid-cols-1 gap-4 min-[1280px]:grid-cols-[52px_minmax(0,1fr)] min-[1600px]:grid-cols-[240px_minmax(0,1fr)]"
        style={{ height: "calc(100dvh - var(--cms-chrome-offset, 11rem))" }}
      >
        <aside className="min-h-0 max-h-[40vh] overflow-y-auto min-[1280px]:max-h-none min-[1280px]:self-stretch" data-cms-outline-pane>
          <HomepageBuilderNav activeSectionId={sectionId} sectionStatus={sectionStatus} />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-3">
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

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)]" data-cms-edit-preview-panes>
            <CmsEditorActionBar
              sectionLabel={getBuilderSectionLabel(sectionId)}
              isDirty={isDirty}
              isSaving={isPending || isFormPending}
              saveStatus={saveStatus}
              publishDisabled={!validation.valid}
              publishDisabledReason={
                !validation.valid
                  ? validation.errors.length === 1
                    ? validation.errors[0]?.message
                    : `Fix ${validation.errors.length} issues before publishing`
                  : undefined
              }
              previewHref={previewHref}
              showSave={showFormActions}
              showPublish={
                Boolean(
                  usesV2Publish &&
                    definition.editorKind !== "footer-view" &&
                    definition.editorKind !== "hero-carousel"
                )
              }
              onSave={showFormActions ? () => saveSection({ refresh: true }) : undefined}
              onPublish={
                usesV2Publish &&
                definition.editorKind !== "footer-view" &&
                definition.editorKind !== "hero-carousel"
                  ? handlePublish
                  : undefined
              }
              publishLabel={publishLabel}
            />
            <HomepageBuilderWorkspace
              device={device}
              onDeviceChange={setDevice}
              editor={
                <div
                  ref={formRef}
                  key={`cms-edit-${sectionId}-${editorEpoch}`}
                  data-cms-edit-pane
                  onChange={markDirty}
                  onInput={markDirty}
                >
                  {editor}
                </div>
              }
              preview={
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

function MissionSectionForm({
  missionKey,
  mission,
  onDirty,
  onSaved,
  onSavingChange,
  uploadImage
}: {
  missionKey: string;
  mission: HomepageCmsContent["missions"]["agri"];
  onDirty: () => void;
  onSaved: () => void;
  onSavingChange?: (pending: boolean) => void;
  uploadImage: (file: File) => Promise<{ src: string; alt?: string } | null>;
}) {
  const [isSaving, startTransition] = useTransition();

  useEffect(() => {
    onSavingChange?.(isSaving);
  }, [isSaving, onSavingChange]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const ok = await runCmsClientSave(
        saveHomepageMissionClientAction,
        formData,
        "Save homepage mission",
        "cms:mission-save"
      );
      if (ok) onSaved();
    });
  };

  const missionDefaultHref = missionKey === "city" ? "/city-drones" : "/agri-drones";

  return (
    <form className="grid gap-4" onChange={onDirty} onSubmit={handleSubmit}>
      <input type="hidden" name="mission_key" value={missionKey} />
      <div className="grid gap-4 min-[1280px]:grid-cols-2">
        <CmsField label="Title" name="title" defaultValue={mission.title} />
        <CmsField label="Eyebrow" name="eyebrow" defaultValue={mission.eyebrow} />
        <CmsField label="Primary CTA" name="cta" defaultValue={mission.cta} />
        <CmsField
          label="Section link"
          name="href"
          defaultValue={mission.href || missionDefaultHref}
        />
      </div>
      <CmsTextAreaField
        label="Intro body"
        name="body"
        defaultValue={editorHtmlToPlainText(mission.body)}
        hint="Plain text is fine"
      />
      <MissionTileEditor tiles={mission.tiles} onDirty={onDirty} onUpload={uploadImage} />
    </form>
  );
}

function AlignmentSelector({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const options = [
    { value: "left", label: "Left" },
    { value: "center", label: "Center" },
    { value: "right", label: "Right" }
  ] as const;
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-[var(--platform-text-secondary)]">Text alignment</span>
      <div className="flex gap-1 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 rounded-[6px] px-3 py-1.5 text-xs font-semibold transition",
              value === opt.value
                ? "bg-[var(--platform-accent-soft)] text-[var(--platform-text-primary)] shadow-sm"
                : "text-[var(--platform-text-muted)] hover:text-[var(--platform-text-secondary)]"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function V2BannerForm({
  sectionKey,
  banner,
  spec,
  onDirty,
  onSaved,
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
  onSaved?: () => void;
  onPendingChange?: (pending: boolean) => void;
  onUpload?: (file: File) => Promise<{ src: string; alt?: string } | null>;
}) {
  const [isSaving, startTransition] = useTransition();
  const [alignment, setAlignment] = useState<"left" | "center" | "right">(
    (banner.alignment === "center" || banner.alignment === "right" ? banner.alignment : "left")
  );

  useEffect(() => {
    onPendingChange?.(isSaving);
  }, [isSaving, onPendingChange]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // Inject controlled alignment value since it's managed outside the form
    formData.set("alignment", alignment);
    startTransition(async () => {
      const ok = await runCmsClientSave(
        saveHomepageV2SectionClientAction,
        formData,
        "Save homepage section",
        "cms:v2-banner-save"
      );
      if (ok) onSaved?.();
    });
  };

  return (
    <form className="grid gap-4" onChange={() => onDirty?.()} onSubmit={handleSubmit}>
      <input type="hidden" name="section_key" value={sectionKey} />
      <div className="grid gap-4 min-[1280px]:grid-cols-2">
        <CmsField label="Heading" name="heading" defaultValue={banner.heading} />
        <CmsField label="Supporting text" name="subtitle" defaultValue={banner.subtitle} />
        <CmsField label="Button text" name="cta_label" defaultValue={banner.ctaLabel} />
        <CmsField
          label="Button link"
          name="href"
          defaultValue={banner.href || "https://mithronsmart.com"}
          placeholder="https://mithronsmart.com"
        />
      </div>
      <AlignmentSelector value={alignment} onChange={(v) => { setAlignment(v as "left" | "center" | "right"); onDirty?.(); }} />
      <input type="hidden" name="overlay_opacity" value={String(banner.overlayOpacity)} readOnly />
      <CmsImageField
        label="Banner image"
        name="image_src"
        altName="image_alt"
        defaultValue={banner.imageSrc}
        defaultAlt={banner.imageAlt}
        spec={spec}
        variant="compact"
        onUpload={onUpload}
        onPreviewChange={() => onDirty?.()}
      />
      <input type="hidden" name="enabled" value={banner.enabled ? "true" : "false"} />
    </form>
  );
}

function FullViewportBannerForm({
  sectionKey,
  banner,
  onDirty,
  onSaved,
  onPendingChange,
  onUpload
}: {
  sectionKey: string;
  banner: HomepageCmsV2Content["banners"]["fullViewport"][number];
  onDirty?: () => void;
  onSaved?: () => void;
  onPendingChange?: (pending: boolean) => void;
  onUpload?: (file: File) => Promise<{ src: string; alt?: string } | null>;
}) {
  const [isSaving, startTransition] = useTransition();
  const mobileSpec = CMS_IMAGE_SPECS.fullViewportMobile;

  useEffect(() => {
    onPendingChange?.(isSaving);
  }, [isSaving, onPendingChange]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("alignment", banner.alignment || "center");
    startTransition(async () => {
      const ok = await runCmsClientSave(
        saveHomepageV2SectionClientAction,
        formData,
        "Save homepage section",
        "cms:full-viewport-banner-save"
      );
      if (ok) onSaved?.();
    });
  };

  return (
    <form className="grid gap-5" onChange={() => onDirty?.()} onSubmit={handleSubmit}>
      <input type="hidden" name="section_key" value={sectionKey} />
      <div className="grid gap-4 min-[1280px]:grid-cols-2">
        <CmsField label="Heading" name="heading" defaultValue={banner.heading} />
        <CmsField label="Supporting text" name="subtitle" defaultValue={banner.subtitle} />
        <CmsField label="Button text" name="cta_label" defaultValue={banner.ctaLabel} />
        <CmsField
          label="Button link"
          name="href"
          defaultValue={banner.href || "https://mithronsmart.com"}
          placeholder="https://mithronsmart.com"
        />
      </div>
      <input type="hidden" name="overlay_opacity" value={String(banner.overlayOpacity)} readOnly />
      <CmsImageField
        label="Desktop banner (16:9 — 1920×1080)"
        name="desktop_image_src"
        altName="desktop_image_alt"
        defaultValue={banner.desktopImageSrc}
        defaultAlt={banner.desktopImageAlt}
        spec={CMS_IMAGE_SPECS.fullViewport}
        variant="compact"
        onUpload={onUpload}
        onPreviewChange={() => onDirty?.()}
      />
      <CmsImageField
        label="Mobile banner (9:16 — 1080×1920)"
        name="mobile_image_src"
        altName="mobile_image_alt"
        defaultValue={banner.mobileImageSrc}
        defaultAlt={banner.mobileImageAlt}
        spec={mobileSpec}
        variant="compact"
        onUpload={onUpload}
        onPreviewChange={() => onDirty?.()}
      />
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
  inFlightRef,
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
  inFlightRef: MutableRefObject<boolean>;
  uploadImage: (file: File) => Promise<{ src: string; alt?: string } | null>;
}) {
  const builder = useOptionalHomepageBuilder();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [, startTransition] = useTransition();
  const slotSources = useMemo(
    () => resolveClientShelfSlotSources(productSlugs, isInferredAssignment, products),
    [isInferredAssignment, productSlugs, products]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    onSavingChange?.(true);
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
          notify.success(result.message || FEEDBACK_MESSAGES.changesSaved, { source: "cms", id: "cms:shelf-save" });
          return;
        }
        notify.error(result.message || FEEDBACK_MESSAGES.failedToSaveChanges, { source: "cms", id: "cms:shelf-save:error" });
      } catch (error) {
        if (isStaleServerActionError(error)) {
          recoverStaleServerAction("cms:shelf-save");
          return;
        }
        notify.error(
          error instanceof Error ? error.message : FEEDBACK_MESSAGES.failedToSaveChanges,
          { source: "cms", id: "cms:shelf-save:error" }
        );
      } finally {
        inFlightRef.current = false;
        onSavingChange?.(false);
      }
    });
  };

  const shelfDefaultHref =
    shelfKey === "droneWorld" ? getHomepageShelfCatalogHref("drone-world")
    : shelfKey === "droneCare" ? getHomepageShelfCatalogHref("drone-care")
    : getHomepageShelfCatalogHref("global-products");

  const shelfDefaultTitle =
    shelfKey === "droneWorld" ? "Drone World"
    : shelfKey === "droneCare" ? "Drone Care"
    : "Global Products";

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
        slotSources={slotSources}
        onSyncWarning={onSyncWarning}
        onChange={(slugs) => {
          onProductSlugsChange(slugs);
          builder?.setShelfSlugs(shelfKey, slugs);
          onDirty();
        }}
      />

      {/* Shelf links — surfaced at top level so admins don't miss them */}
      <div className="grid gap-4 rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-4 py-4 min-[1280px]:grid-cols-2">
        <p className="col-span-full text-xs font-semibold text-[var(--platform-text-primary)]">Links</p>
        <CmsField
          label='"View all" link'
          name="href"
          defaultValue={shelf.href || shelfDefaultHref}
        />
        <CmsField
          label="Banner CTA link"
          name="hero_cta_href"
          defaultValue={shelf.heroCtaHref || shelfDefaultHref}
        />
      </div>

      <details
        open={settingsOpen}
        onToggle={(event) => setSettingsOpen((event.currentTarget as HTMLDetailsElement).open)}
        className="rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--platform-text-primary)] [&::-webkit-details-marker]:hidden">
          <span>Shelf content &amp; banner</span>
          <ChevronDown className={cn("size-4 shrink-0 transition", settingsOpen && "rotate-180")} aria-hidden="true" />
        </summary>
        <div className="grid gap-5 border-t border-[var(--platform-border)] px-4 py-5">
          <div className="grid gap-4 min-[1280px]:grid-cols-2">
            <CmsField
              label="Section title"
              name="title"
              defaultValue={shelf.title?.trim() || shelfDefaultTitle}
            />
            <CmsField label="Eyebrow" name="eyebrow" defaultValue={shelf.eyebrow} />
            <CmsField label="Banner description" name="hero_body" defaultValue={shelf.heroBody} />
            <CmsField label="Banner CTA label" name="feature_cta" defaultValue={shelf.featureCta} />
          </div>
          <CmsImageField
            label="Shelf banner image (1920×650)"
            name="hero_image_src"
            altName="hero_image_alt"
            defaultValue={shelf.heroImageSrc}
            defaultAlt={shelf.heroImageAlt}
            spec={CMS_IMAGE_SPECS.shelfBanner}
            variant="compact"
            onUpload={uploadImage}
          />
        </div>
      </details>
    </form>
  );
}
