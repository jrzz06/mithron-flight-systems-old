"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { invalidateCmsRedisCaches } from "@/lib/cache-invalidation";
import { invalidateControlPlaneRedisCaches } from "@/lib/cache-redis";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { assertWritableCmsTable } from "@/lib/cms/deprecated-tables";
import { assertOptionalCmsMediaSrc, assertValidCmsMediaSrc } from "@/lib/cms/media-validation";
import { isNextRedirect } from "@/lib/server-action-feedback";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { HomepageCmsContent, HomepageCmsSectionId, HomepageMissionCms, HomepageShelfCms } from "@/config/homepage-cms";
import type { HomepageCmsV2Content } from "@/config/homepage-cms-v2";
import { mergeHomepageCmsV2Content } from "@/config/homepage-cms-v2";
import { homepageSectionRegistry } from "@/config/homepage-section-registry";
import { footerContent } from "@/config/storefront-content";
import { mergeHomepageCmsContent, extractHomepageV1LiveFields } from "@/services/homepage-cms";
import { getHomepageProducts } from "@/services/catalog";
import { buildPinnedMiniCarouselSlides, resolveMiniCarouselEditorState } from "@/lib/cms/homepage-slot-assignment";
import { getHomepageCmsV2DraftPreviewContent } from "@/services/homepage-cms-v2";
import { readRichTextHtmlField } from "@/lib/editor/read-form-content";
import { upsertMediaAssetRecord } from "@/services/admin-actions";
import {
  buildCategoryMetadataDraftFromFormData,
  buildContentRevisionRecordFromFormData,
  buildContentRevisionRestoreFromFormData,
  buildCmsPageDraftFromFormData,
  buildCmsSectionDraftFromFormData,
  buildFaqDraftFromFormData,
  buildFooterColumnDraftFromFormData,
  buildFooterLinkDraftFromFormData,
  buildHeroBannerDraftFromFormData,
  buildHeroBannerStateFromFormData,
  buildHomepageOrderingDraftFromFormData,
  buildSectionVisibilityDraftFromFormData,
  buildPromotionalCampaignDraftFromFormData,
  buildSiteNavigationDraftFromFormData
} from "@/services/cms-admin-forms";
import {
  archiveCmsWorkflowRecord,
  archiveHeroBannerWorkflow,
  publishCmsWorkflowRecord,
  publishHeroBannerWorkflow,
  saveCmsWorkflowDraft,
  saveHeroBannerDraftWorkflow,
  type CmsWorkflowDraftInput,
  type CmsWorkflowStateInput,
  type HeroBannerDraftInput,
  type HeroBannerStateInput
} from "@/services/cms-admin-workflows";
import { recordCmsRevision, restoreCmsRevision } from "@/services/cms-crud";
import { getCurrentAuthContext, requireAdminPermission, requirePermission } from "@/services/auth";
import {
  assertCmsPublishPolicyAllowed,
  assertSectionVisibilityPolicyAllowed,
  getAdminSettingsPolicy
} from "@/services/admin-settings-policy";
import {
  assertAllowedMediaBucket,
  assertAllowedMediaMimeType,
  assertMediaUploadSize,
  buildMediaAssetId,
  buildMediaAssetRecordFromFormData,
  buildStorageObjectPath
} from "@/services/media-manager";
import {
  buildOptimizedVariantStoragePath,
  buildResponsiveVariantsMetadata,
  buildSupabasePublicObjectUrl,
  createOptimizedImageThumbnail,
  findStoredOptimizedVariant,
  findLargestStoredAvifVariant,
  readImageBufferMetadata,
  type StoredOptimizedImageVariant
} from "@/services/media-optimization";
import { cleanupReplacedCmsMedia } from "@/lib/cms/cms-media-cleanup";

type HeroBannerDraftActionInput = Omit<HeroBannerDraftInput, "actorId">;
type HeroBannerStateActionInput = Omit<HeroBannerStateInput, "actorId">;
type CmsWorkflowDraftActionInput = Omit<CmsWorkflowDraftInput, "actorId">;
type CmsWorkflowStateActionInput = Omit<CmsWorkflowStateInput, "actorId">;

async function currentActorId() {
  const context = await getCurrentAuthContext();
  return context.userId;
}

function encodeObjectPath(path: string) {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function isUploadFile(value: FormDataEntryValue): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

function readText(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function readImageMetadata(buffer: Buffer, mimeType: string) {
  return readImageBufferMetadata(buffer, mimeType);
}

async function uploadCmsStorageObject(bucket: string, storagePath: string, contentType: string, buffer: Buffer) {
  const config = assertSupabaseAdminConfig();
  const uploadBody = new Uint8Array(buffer.byteLength);
  uploadBody.set(buffer);

  const response = await fetchWithTimeout(
    `${config.url}/storage/v1/object/${bucket}/${encodeObjectPath(storagePath)}`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "x-upsert": "false"
      },
      body: uploadBody
    },
    30_000
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`CMS image upload failed for ${bucket}/${storagePath}: ${response.status} ${response.statusText} ${text}`);
  }

  return buildSupabasePublicObjectUrl(config.url, bucket, storagePath);
}

/** Upload original first, then a single thumbnail — avoids 5× sharp encodes on the request path. */
async function uploadCmsThumbnailVariant(bucket: string, storagePath: string, buffer: Buffer, mimeType: string) {
  const config = assertSupabaseAdminConfig();
  const thumbnail = await createOptimizedImageThumbnail(buffer, mimeType);
  if (!thumbnail) return [] as StoredOptimizedImageVariant[];

  const variantStoragePath = buildOptimizedVariantStoragePath(storagePath, thumbnail);
  await uploadCmsStorageObject(bucket, variantStoragePath, thumbnail.mimeType, thumbnail.buffer);
  return [{
    ...thumbnail,
    storagePath: variantStoragePath,
    publicUrl: buildSupabasePublicObjectUrl(config.url, bucket, variantStoragePath)
  }] satisfies StoredOptimizedImageVariant[];
}

function buildCmsMediaRecordFormData(formData: FormData, overrides: Record<string, string>) {
  const recordForm = new FormData();
  for (const key of [
    "folder",
    "tags",
    "alt_text",
    "caption",
    "visibility",
    "usage_scope",
    "avif_path",
    "webp_path",
    "thumbnail_path",
    "responsive_variants",
    "upload_metadata",
    "content_hash"
  ]) {
    const value = formData.get(key);
    if (typeof value === "string") recordForm.set(key, value);
  }

  for (const [key, value] of Object.entries(overrides)) {
    recordForm.set(key, value);
  }

  return recordForm;
}

type CmsRevalidateScope = "homepage" | "cms-surface" | "full";

async function revalidateCmsCutoverPaths(table?: string, scope: CmsRevalidateScope = "homepage") {
  revalidateTag("cms", "max");
  revalidateTag("cms-public", "max");
  revalidateTag("cms-orchestration", "max");
  revalidateTag("homepage-cms", "max");
  revalidateTag("homepage-cms-v2", "max");
  revalidateTag("admin-settings", "max");
  revalidateTag("cms-footer-lead", "max");
  if (table) revalidateTag(`cms-${table}`, "max");
  revalidatePath("/admin/cms");
  // Homepage content changes need page refresh; keep layout reserved for shell/nav tables.
  revalidatePath("/", "page");
  if (table === "site_navigation" || table === "footer_columns" || table === "footer_links") {
    revalidatePath("/", "layout");
  }
  if (scope === "full" || scope === "cms-surface") {
    revalidatePath("/products");
  }
  // Avoid blasting every category/product path on generic CMS publishes.
  // Category/product catalog surfaces are invalidated via catalog cache tags when products change.
  if (scope === "full" && (table === "category_metadata" || table === "homepage_ordering")) {
    revalidatePath("/category/agri-drones");
    revalidatePath("/category/video-drones");
    revalidatePath("/category/creative-drones");
    revalidatePath("/category/survey-drones");
    revalidatePath("/category/surveillance-drones");
    revalidatePath("/category/accessories");
    revalidatePath("/category/global-products");
  }
  await invalidateCmsRedisCaches();
  void invalidateControlPlaneRedisCaches({ cmsSnapshots: true });
}

function cmsActionMessage(error: unknown) {
  if (isNextRedirect(error)) throw error;
  if (error instanceof Error && error.message) return error.message.slice(0, 360);
  return "CMS mutation failed. Check the submitted fields and retry.";
}

function cmsRedirectUrl(status: "success" | "error", table: string, message: string, section?: string) {
  const params = new URLSearchParams({
    cms_status: status,
    cms_table: table,
    cms_message: message
  });
  if (section) params.set("section", section);
  return `/admin/cms?${params.toString()}#cms-status`;
}

async function runCmsFormMutation(table: string, successMessage: string, mutation: () => Promise<unknown>, section?: string) {
  if (table === "media_assets") {
    await requireAdminPermission("media.write");
  } else {
    await requirePermission("cms.write");
  }
  let status: "success" | "error" = "success";
  let message = successMessage;
  try {
    await mutation();
    const scope: CmsRevalidateScope =
      table === "category_metadata" || table === "site_navigation" || table === "promotional_campaigns"
        ? "full"
        : table === "faqs" || table === "footer_columns" || table === "footer_links"
          ? "cms-surface"
          : "homepage";
    await revalidateCmsCutoverPaths(table, scope);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    status = "error";
    message = cmsActionMessage(error);
  }

  redirect(cmsRedirectUrl(status, table, message, section));
}

type JsonRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function adminSettingsClient() {
  const config = assertSupabaseAdminConfig();
  return createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function loadAdminSettingsPayload(): Promise<JsonRecord> {
  const supabase = adminSettingsClient();
  const { data, error } = await supabase.from("admin_settings").select("payload").eq("id", "global").maybeSingle();
  if (error) throw new Error(`Failed to load admin settings: ${error.message}`);
  const payload = data?.payload;
  return isPlainRecord(payload) ? payload : {};
}

async function saveHomepageSettingsContent(
  section: HomepageCmsSectionId,
  updater: (current: HomepageCmsContent) => HomepageCmsContent,
  successMessage: string
) {
  await runCmsFormMutation("homepage_cms", successMessage, async () => {
    await persistHomepageV1Draft(section, updater);
  }, section);
}

async function persistHomepageV1Draft(
  _section: HomepageCmsSectionId,
  updater: (current: HomepageCmsContent) => HomepageCmsContent
) {
  const actorId = await currentActorId();
  const current = await loadAdminSettingsPayload();
  const homepageStored = isPlainRecord(current.homepage) ? current.homepage : {};
  const live = mergeHomepageCmsContent(homepageStored);
  const draftBase = isPlainRecord(homepageStored.draftV1)
    ? mergeHomepageCmsContent({ ...homepageStored, ...homepageStored.draftV1 })
    : live;
  const nextDraft = extractHomepageV1LiveFields(updater(draftBase));
  const nextPayload = {
    ...current,
    homepage: {
      ...homepageStored,
      draftV1: nextDraft,
      v2: homepageStored.v2,
      draftV2: homepageStored.draftV2
    },
    updated_by: actorId,
    updated_at: new Date().toISOString()
  };

  const supabase = adminSettingsClient();
  const { error } = await supabase.from("admin_settings").upsert(
    { id: "global", payload: nextPayload, updated_by: actorId, updated_at: nextPayload.updated_at },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Failed to save homepage draft: ${error.message}`);
  return { previous: live, current: nextDraft, nextPayload };
}

async function publishHomepageV1Core() {
  const actorId = await currentActorId();
  const current = await loadAdminSettingsPayload();
  const homepageStored = isPlainRecord(current.homepage) ? current.homepage : {};
  const live = mergeHomepageCmsContent(homepageStored);
  const draft = isPlainRecord(homepageStored.draftV1)
    ? mergeHomepageCmsContent({ ...homepageStored, ...homepageStored.draftV1 })
    : live;
  const published = extractHomepageV1LiveFields(draft);
  const previousHomepage = { ...homepageStored };
  const nextHomepage = {
    ...homepageStored,
    ...published,
    draftV1: published,
    v2: homepageStored.v2,
    draftV2: homepageStored.draftV2
  };
  const nextPayload = {
    ...current,
    homepage: nextHomepage,
    updated_by: actorId,
    updated_at: new Date().toISOString()
  };

  const supabase = adminSettingsClient();
  const { error } = await supabase.from("admin_settings").upsert(
    { id: "global", payload: nextPayload, updated_by: actorId, updated_at: nextPayload.updated_at },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Failed to publish homepage content: ${error.message}`);

  const shelfKeys = ["droneWorld", "droneCare", "globalProducts"] as const;
  for (const shelfKey of shelfKeys) {
    await cleanupReplacedCmsMedia({
      oldUrls: [live.shelves[shelfKey].heroImageSrc],
      nextCmsState: nextPayload
    });
  }
  return { previous: previousHomepage, published, nextPayload };
}

export async function saveHomepageShelfFormAction(formData: FormData) {
  const { shelfKey, patch, section } = buildHomepageShelfPatchFromFormData(formData);
  await saveHomepageSettingsContent(
    section,
    (current) => ({
      ...current,
      shelves: {
        ...current.shelves,
        [shelfKey]: { ...current.shelves[shelfKey], ...patch }
      }
    }),
    `${patch.title || "Shelf"} draft saved. Publish to update the live homepage.`
  );
}

export async function saveHomepageShelfClientAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    await requirePermission("cms.write");
    const { shelfKey, patch, section } = buildHomepageShelfPatchFromFormData(formData);
    await persistHomepageV1Draft(section, (current) => ({
      ...current,
      shelves: {
        ...current.shelves,
        [shelfKey]: { ...current.shelves[shelfKey], ...patch }
      }
    }));
    await revalidateCmsCutoverPaths("homepage_cms");
    return { ok: true, message: `${patch.title || "Shelf"} draft saved.` };
  } catch (error) {
    return { ok: false, message: cmsActionMessage(error) };
  }
}

export async function publishHomepageV1ClientAction(): Promise<{ ok: boolean; message: string }> {
  try {
    await requirePermission("cms.write");
    await publishHomepageV1Core();
    await revalidateCmsCutoverPaths("homepage_cms");
    return { ok: true, message: "Homepage content published." };
  } catch (error) {
    return { ok: false, message: cmsActionMessage(error) };
  }
}

export async function publishHomepageV1FormAction() {
  await runCmsFormMutation("homepage_cms", "Homepage content published.", async () => {
    await publishHomepageV1Core();
  }, "homepage_v1");
}

export async function pinMiniCarouselDraftClientAction(): Promise<{ ok: boolean; message: string }> {
  try {
    await requirePermission("cms.write");
    const [products, homepageV2] = await Promise.all([getHomepageProducts(), getHomepageCmsV2DraftPreviewContent()]);
    const state = resolveMiniCarouselEditorState(homepageV2.miniCarousel, products);
    const slides = buildPinnedMiniCarouselSlides(state.slots);
    await mutateHomepageV2Draft((current) => ({
      ...current,
      miniCarousel: {
        enabled: state.enabled,
        slides
      }
    }));
    await revalidateCmsCutoverPaths("homepage_cms_v2");
    return { ok: true, message: "Mini carousel assignments saved to CMS draft." };
  } catch (error) {
    return { ok: false, message: cmsActionMessage(error) };
  }
}

function buildHomepageShelfPatchFromFormData(formData: FormData) {
  const shelfKey = readText(formData, "shelf_key", "droneWorld") as keyof HomepageCmsContent["shelves"];
  const sectionMap: Record<keyof HomepageCmsContent["shelves"], HomepageCmsSectionId> = {
    droneWorld: "shelf-drone-world",
    droneCare: "shelf-drone-care",
    globalProducts: "shelf-global-products"
  };
  const section = sectionMap[shelfKey] ?? "shelf-drone-world";
  const patch: Partial<HomepageShelfCms> = {
    eyebrow: readText(formData, "eyebrow"),
    title: readText(formData, "title"),
    href: readText(formData, "href"),
    viewAllLabel: readText(formData, "view_all_label"),
    heroEyebrow: readText(formData, "hero_eyebrow"),
    heroSubtitle: readText(formData, "hero_subtitle"),
    heroBody: readRichTextHtmlField(formData, "hero_body"),
    featureCta: readText(formData, "feature_cta"),
    heroCtaHref: readText(formData, "hero_cta_href"),
    heroImageSrc: assertOptionalCmsMediaSrc(readText(formData, "hero_image_src"), "Shelf hero image"),
    heroImageAlt: readText(formData, "hero_image_alt"),
    productSlugs: readText(formData, "product_slugs")
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean),
    productCount: Math.max(1, Math.min(12, Number(readText(formData, "product_count", "5")) || 5))
  };
  return { shelfKey, patch, section };
}

async function persistHomepageSettingsContent(
  section: HomepageCmsSectionId,
  updater: (current: HomepageCmsContent) => HomepageCmsContent
) {
  return persistHomepageV1Draft(section, updater);
}

export async function saveHomepageMissionFormAction(formData: FormData) {
  const missionKey = readText(formData, "mission_key", "agri") as keyof HomepageCmsContent["missions"];
  const section = missionKey === "city" ? "mission-city" : "mission-agri";
  const tileCount = Number(readText(formData, "tile_count", "5"));
  const tiles = Array.from({ length: tileCount }, (_, index) => ({
    label: readText(formData, `tile_${index}_label`),
    body: readRichTextHtmlField(formData, `tile_${index}_body`),
    operator: readText(formData, `tile_${index}_operator`),
    model: readText(formData, `tile_${index}_model`),
    location: readText(formData, `tile_${index}_location`),
    imageSrc: assertOptionalCmsMediaSrc(readText(formData, `tile_${index}_image_src`), `Mission tile ${index + 1} image`),
    imageAlt: readText(formData, `tile_${index}_image_alt`),
    href: readText(formData, `tile_${index}_href`)
  }));
  const patch: Partial<HomepageMissionCms> = {
    eyebrow: readText(formData, "eyebrow"),
    title: readText(formData, "title"),
    body: readRichTextHtmlField(formData, "body"),
    href: readText(formData, "href"),
    cta: readText(formData, "cta"),
    mediaNote: readText(formData, "media_note"),
    tiles
  };
  await saveHomepageSettingsContent(
    section,
    (current) => ({
      ...current,
      missions: {
        ...current.missions,
        [missionKey]: {
          ...current.missions[missionKey],
          ...patch,
          tiles: current.missions[missionKey].tiles.map((tile, index) => ({
            ...tile,
            ...(tiles[index] ?? {})
          }))
        }
      }
    }),
    `${patch.title || "Mission section"} draft saved. Publish to update the live homepage.`
  );
}

export async function saveHomepageTestimonialsHeaderFormAction(formData: FormData) {
  const patch = {
    eyebrow: readText(formData, "eyebrow"),
    title: readText(formData, "title"),
    titleAccent: readText(formData, "title_accent"),
    lead: readText(formData, "lead"),
    linkLabel: readText(formData, "link_label"),
    linkHref: readText(formData, "link_href")
  };
  await saveHomepageSettingsContent(
    "testimonials",
    (current) => ({
      ...current,
      testimonials: { ...current.testimonials, ...patch }
    }),
    "Reviews header draft saved. Publish to update the live homepage."
  );
}

export async function saveHomepageFooterLeadFormAction(formData: FormData) {
  await runCmsFormMutation("footer", "Footer lead copy updated on the live homepage.", async () => {
    const actorId = await currentActorId();
    const current = await loadAdminSettingsPayload();
    const footer = {
      leadTitle: readText(formData, "footer_lead_title", footerContent.leadTitle),
      leadBody: readRichTextHtmlField(formData, "footer_lead_body"),
      contactEmail: readText(formData, "footer_contact_email", footerContent.contactEmail ?? ""),
      contactPhone: readText(formData, "footer_contact_phone", footerContent.contactPhone ?? ""),
      legalText: readText(formData, "footer_legal_text")
    };
    const nextPayload = {
      ...current,
      footer,
      updated_by: actorId,
      updated_at: new Date().toISOString()
    };
    const supabase = adminSettingsClient();
    const { error } = await supabase.from("admin_settings").upsert(
      { id: "global", payload: nextPayload, updated_by: actorId, updated_at: nextPayload.updated_at },
      { onConflict: "id" }
    );
    if (error) throw new Error(`Failed to save footer lead: ${error.message}`);
  }, "footer");
}

export async function saveHeroBannerDraftAction(input: HeroBannerDraftActionInput) {
  await requirePermission("cms.write");
  const previous = await loadHeroBannerImage(input.id);
  const record = await saveHeroBannerDraftWorkflow({
    ...input,
    actorId: await currentActorId()
  });
  await cleanupReplacedCmsMedia({
    oldUrls: collectMediaUrls(previous),
    nextCmsState: await loadAdminSettingsPayload(),
    additionalReferences: await loadHeroMediaReferences()
  });
  await revalidateCmsCutoverPaths("hero_banners");
  return record;
}

export async function publishHeroBannerAction(input: HeroBannerStateActionInput) {
  await requirePermission("cms.write");
  const record = await publishHeroBannerWorkflow({
    ...input,
    actorId: await currentActorId()
  });
  await revalidateCmsCutoverPaths("hero_banners");
  return record;
}

export async function archiveHeroBannerAction(input: HeroBannerStateActionInput) {
  await requirePermission("cms.write");
  const record = await archiveHeroBannerWorkflow({
    ...input,
    actorId: await currentActorId()
  });
  await revalidateCmsCutoverPaths("hero_banners");
  return record;
}

export async function saveCmsWorkflowDraftAction(input: CmsWorkflowDraftActionInput) {
  await requirePermission("cms.write");
  const record = await saveCmsWorkflowDraft({
    ...input,
    actorId: await currentActorId()
  });
  await revalidateCmsCutoverPaths(input.table);
  return record;
}

export async function publishCmsWorkflowRecordAction(input: CmsWorkflowStateActionInput) {
  await requirePermission("cms.write");
  const record = await publishCmsWorkflowRecord({
    ...input,
    actorId: await currentActorId()
  });
  await revalidateCmsCutoverPaths(input.table);
  return record;
}

export async function archiveCmsWorkflowRecordAction(input: CmsWorkflowStateActionInput) {
  await requirePermission("cms.write");
  const record = await archiveCmsWorkflowRecord({
    ...input,
    actorId: await currentActorId()
  });
  await revalidateCmsCutoverPaths(input.table);
  return record;
}

export async function saveSectionVisibilityDraftFormAction(formData: FormData) {
  const policy = await getAdminSettingsPolicy();
  assertSectionVisibilityPolicyAllowed(policy);
  const draftInput = buildSectionVisibilityDraftFromFormData(formData);
  await runCmsFormMutation("section_visibility", "Section visibility draft saved. Publish to update the live website.", async () => {
    await saveCmsWorkflowDraft({
      ...draftInput,
      actorId: await currentActorId()
    });
  });
}

export async function saveHomepageOrderingDraftFormAction(formData: FormData) {
  const draftInput = buildHomepageOrderingDraftFromFormData(formData);
  await runCmsFormMutation("homepage_ordering", "Homepage ordering draft saved. Publish to update the live website.", async () => {
    await saveCmsWorkflowDraft({
      ...draftInput,
      actorId: await currentActorId()
    });
  });
}

export async function saveCmsPageDraftFormAction(formData: FormData) {
  const draftInput = buildCmsPageDraftFromFormData(formData);
  await runCmsFormMutation("cms_pages", "CMS page draft saved. Publish to update the live website.", async () => {
    await saveCmsWorkflowDraft({
      ...draftInput,
      actorId: await currentActorId()
    });
  });
}

export async function saveCmsSectionDraftFormAction(formData: FormData) {
  const draftInput = buildCmsSectionDraftFromFormData(formData);
  await runCmsFormMutation("cms_sections", "CMS section draft saved. Publish to update the live website.", async () => {
    await saveCmsWorkflowDraft({
      ...draftInput,
      actorId: await currentActorId()
    });
  });
}

export async function recordContentRevisionFormAction(formData: FormData) {
  const draftInput = buildContentRevisionRecordFromFormData(formData);
  await runCmsFormMutation("content_revisions", "Content revision recorded.", async () => {
    await recordCmsRevision({
      ...draftInput,
      actorId: await currentActorId()
    });
  });
}

export async function restoreContentRevisionAction(formData: FormData) {
  const draftInput = buildContentRevisionRestoreFromFormData(formData);
  await runCmsFormMutation(draftInput.table, "Content revision restored.", async () => {
    await restoreCmsRevision({
      ...draftInput,
      actorId: await currentActorId(),
      requestId: readText(formData, "publish_request_id")
    });
  });
}

export async function saveSiteNavigationDraftFormAction(formData: FormData) {
  const draftInput = buildSiteNavigationDraftFromFormData(formData);
  await runCmsFormMutation("site_navigation", "Navigation draft saved. Publish to update the live website.", async () => {
    await saveCmsWorkflowDraft({
      ...draftInput,
      actorId: await currentActorId()
    });
  });
}

export async function saveFooterColumnDraftFormAction(formData: FormData) {
  const draftInput = buildFooterColumnDraftFromFormData(formData);
  await runCmsFormMutation("footer_columns", "Footer column draft saved. Publish to update the live website.", async () => {
    await saveCmsWorkflowDraft({
      ...draftInput,
      actorId: await currentActorId()
    });
  });
}

export async function saveFooterLinkDraftFormAction(formData: FormData) {
  const draftInput = buildFooterLinkDraftFromFormData(formData);
  await runCmsFormMutation("footer_links", "Footer link draft saved. Publish to update the live website.", async () => {
    await saveCmsWorkflowDraft({
      ...draftInput,
      actorId: await currentActorId()
    });
  });
}

export async function saveFaqDraftFormAction(formData: FormData) {
  const draftInput = buildFaqDraftFromFormData(formData);
  await runCmsFormMutation("faqs", "FAQ draft saved. Publish to update the live website.", async () => {
    await saveCmsWorkflowDraft({
      ...draftInput,
      actorId: await currentActorId()
    });
  });
}

export async function saveProductReviewDraftFormAction(_formData: FormData) {
  await requirePermission("cms.write");
  // Legacy marketing `product_reviews` table is retired from the admin workspace.
  // Live storefront reviews are moderated at /admin/reviews (customer_order_reviews).
  redirect("/admin/reviews?review_status=error&review_message=" + encodeURIComponent(
    "Legacy CMS product reviews are retired. Manage live storefront reviews here."
  ));
}

export async function savePromotionalCampaignDraftFormAction(formData: FormData) {
  const draftInput = buildPromotionalCampaignDraftFromFormData(formData);
  await runCmsFormMutation("promotional_campaigns", "Promotional campaign draft saved. Publish to update the live website.", async () => {
    await saveCmsWorkflowDraft({
      ...draftInput,
      actorId: await currentActorId()
    });
  });
}

export async function saveCmsMediaUploadFormAction(formData: FormData) {
  await runCmsFormMutation("media_assets", "Image uploaded.", async () => {
    const actorId = await currentActorId();
    const bucket = assertAllowedMediaBucket(readText(formData, "bucket", "mithron-products"));
    const uploadedFiles = formData.getAll("files").filter(isUploadFile);
    const now = new Date().toISOString();

    if (!uploadedFiles.length) {
      throw new Error("Choose an image before uploading.");
    }

    for (let index = 0; index < uploadedFiles.length; index += 1) {
      const file = uploadedFiles[index];
      const mimeType = assertAllowedMediaMimeType(file.type || "application/octet-stream", bucket);
      assertMediaUploadSize(file);
      const uploadAt = new Date(Date.parse(now) + index).toISOString();
      const storagePath = buildStorageObjectPath({
        bucket,
        folder: readText(formData, "folder", "cms"),
        fileName: file.name,
        at: uploadAt
      });
      const buffer = Buffer.from(await file.arrayBuffer());
      const sourceDimensions = await readImageMetadata(buffer, mimeType);
      // Original first — keep the request path light; only a single thumbnail is encoded sync.
      const publicUrl = await uploadCmsStorageObject(bucket, storagePath, mimeType, buffer);
      const optimizedVariants = await uploadCmsThumbnailVariant(bucket, storagePath, buffer, mimeType);
      const storedPath = storagePath;
      const storedMimeType = mimeType;
      const storedSizeBytes = buffer.byteLength;
      const storedWidth = sourceDimensions.width;
      const storedHeight = sourceDimensions.height;
      const thumbnailVariant = findStoredOptimizedVariant(optimizedVariants, "thumbnail", "webp");
      const webpVariant = thumbnailVariant;
      const avifVariant = findLargestStoredAvifVariant(optimizedVariants);
      const optimizedUploadedBytes = optimizedVariants.reduce((total, variant) => total + variant.sizeBytes, 0) + buffer.byteLength;
      const recordId = buildMediaAssetId(bucket, storedPath);

      const recordForm = buildCmsMediaRecordFormData(formData, {
        id: recordId,
        bucket,
        storage_path: storedPath,
        public_url: publicUrl,
        mime_type: storedMimeType,
        file_size_bytes: String(storedSizeBytes),
        width: storedWidth ? String(storedWidth) : "",
        height: storedHeight ? String(storedHeight) : "",
        thumbnail_path: thumbnailVariant?.storagePath ?? "",
        webp_path: webpVariant?.storagePath ?? "",
        avif_path: avifVariant?.storagePath ?? "",
        responsive_variants: JSON.stringify(buildResponsiveVariantsMetadata(optimizedVariants, {
          width: sourceDimensions.width,
          height: sourceDimensions.height,
          sizeBytes: file.size,
          mimeType,
          storagePath,
          publicUrl,
          uploadedBytes: optimizedUploadedBytes
        })),
        upload_metadata: JSON.stringify({
          original_file_name: file.name,
          original_mime_type: mimeType,
          original_size_bytes: file.size,
          optimized_uploaded_bytes: optimizedUploadedBytes,
          usage_scope: readText(formData, "usage_scope", "cms"),
          source: "admin-cms-editor"
        })
      });

      await upsertMediaAssetRecord(
        buildMediaAssetRecordFromFormData(recordForm, { actorId, at: uploadAt }),
        actorId
      );
    }

    revalidatePath("/admin/cms");
    revalidatePath("/admin/media");
  });
}

export async function saveCategoryMetadataDraftFormAction(formData: FormData) {
  const draftInput = buildCategoryMetadataDraftFromFormData(formData);
  await runCmsFormMutation("category_metadata", "Category metadata draft saved. Publish to update the live website.", async () => {
    await saveCmsWorkflowDraft({
      ...draftInput,
      actorId: await currentActorId()
    });
  });
}

export async function saveHeroBannerDraftFormAction(formData: FormData) {
  const imageSrc = readText(formData, "image_src");
  if (imageSrc) {
    assertValidCmsMediaSrc(imageSrc, "Hero banner image");
  }
  const draftInput = buildHeroBannerDraftFromFormData(formData);
  await runCmsFormMutation("hero_banners", "Hero banner draft saved. Publish to update the live website.", async () => {
    const previous = await loadHeroBannerImage(draftInput.id);
    await saveHeroBannerDraftWorkflow({
      ...draftInput,
      actorId: await currentActorId()
    });
    await cleanupReplacedCmsMedia({
      oldUrls: collectMediaUrls(previous),
      nextCmsState: await loadAdminSettingsPayload(),
      additionalReferences: await loadHeroMediaReferences()
    });
  });
}

export async function publishHeroBannerFormAction(formData: FormData) {
  const policy = await getAdminSettingsPolicy();
  assertCmsPublishPolicyAllowed(policy);
  const stateInput = buildHeroBannerStateFromFormData(formData);
  await runCmsFormMutation("hero_banners", "Hero banner published and live website cache invalidated.", async () => {
    await publishHeroBannerWorkflow({
      ...stateInput,
      actorId: await currentActorId(),
      changeSummary: stateInput.changeSummary ?? `Publish hero banner ${stateInput.id}`
    });
  });
}

export async function archiveHeroBannerFormAction(formData: FormData) {
  const stateInput = buildHeroBannerStateFromFormData(formData);
  await runCmsFormMutation("hero_banners", "Hero banner archived.", async () => {
    await archiveHeroBannerWorkflow({
      ...stateInput,
      actorId: await currentActorId(),
      changeSummary: stateInput.changeSummary ?? `Archive hero banner ${stateInput.id}`
    });
  });
}

export async function publishCmsWorkspaceRecordFormAction(formData: FormData) {
  const policy = await getAdminSettingsPolicy();
  assertCmsPublishPolicyAllowed(policy);
  const table = readText(formData, "entity_table");
  const entityId = readText(formData, "entity_id");
  const requestId = readText(formData, "publish_request_id");
  const changeSummary = readText(formData, "change_summary", `Publish ${entityId}`);
  const relatedTables = formData.getAll("related_publish_table").map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean);
  const relatedEntityIds = formData.getAll("related_publish_entity_id").map((value) => (typeof value === "string" ? value.trim() : ""));
  const relatedChangeSummaries = formData.getAll("related_publish_change_summary").map((value) => (typeof value === "string" ? value.trim() : ""));
  if (!table || !entityId) throw new Error("CMS publish requires a section target.");
  assertWritableCmsTable(table);
  for (const relatedTable of relatedTables) {
    assertWritableCmsTable(relatedTable);
  }

  await runCmsFormMutation(table, "Section published and live website cache invalidated.", async () => {
    const actorId = await currentActorId();
    if (table === "hero_banners") {
      await publishHeroBannerWorkflow({
        id: entityId,
        actorId,
        changeSummary,
        requestId
      });
    } else {
      await publishCmsWorkflowRecord({
        table,
        entityId,
        actorId,
        changeSummary,
        requestId
      });
    }

    for (const [index, relatedTable] of relatedTables.entries()) {
      const relatedEntityId = relatedEntityIds[index] ?? "";
      if (!relatedEntityId) continue;
      const relatedSummary = relatedChangeSummaries[index] || `Publish ${relatedEntityId}`;
      const relatedRequestId = requestId ? `${requestId}:related:${index + 1}` : null;

      if (relatedTable === "hero_banners") {
        await publishHeroBannerWorkflow({
          id: relatedEntityId,
          actorId,
          changeSummary: relatedSummary,
          requestId: relatedRequestId
        });
        continue;
      }

      await publishCmsWorkflowRecord({
        table: relatedTable,
        entityId: relatedEntityId,
        actorId,
        changeSummary: relatedSummary,
        requestId: relatedRequestId
      });
    }
  });
}

export async function archiveCmsWorkspaceRecordFormAction(formData: FormData) {
  const table = readText(formData, "entity_table");
  const entityId = readText(formData, "entity_id");
  const requestId = readText(formData, "publish_request_id");
  const changeSummary = readText(formData, "change_summary", `Unpublish ${entityId}`);
  const relatedTables = formData.getAll("related_archive_table").map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean);
  const relatedEntityIds = formData.getAll("related_archive_entity_id").map((value) => (typeof value === "string" ? value.trim() : ""));
  const relatedChangeSummaries = formData.getAll("related_archive_change_summary").map((value) => (typeof value === "string" ? value.trim() : ""));
  if (!table || !entityId) throw new Error("CMS unpublish requires a section target.");

  await runCmsFormMutation(table, "Section unpublished and live website cache invalidated.", async () => {
    const actorId = await currentActorId();
    if (table === "hero_banners") {
      await archiveHeroBannerWorkflow({
        id: entityId,
        actorId,
        changeSummary,
        requestId
      });
    } else {
      await archiveCmsWorkflowRecord({
        table,
        entityId,
        actorId,
        changeSummary,
        requestId
      });
    }

    for (const [index, relatedTable] of relatedTables.entries()) {
      const relatedEntityId = relatedEntityIds[index] ?? "";
      if (!relatedEntityId) continue;
      const relatedSummary = relatedChangeSummaries[index] || `Unpublish ${relatedEntityId}`;
      const relatedRequestId = requestId ? `${requestId}:related:${index + 1}` : null;

      if (relatedTable === "hero_banners") {
        await archiveHeroBannerWorkflow({
          id: relatedEntityId,
          actorId,
          changeSummary: relatedSummary,
          requestId: relatedRequestId
        });
        continue;
      }

      await archiveCmsWorkflowRecord({
        table: relatedTable,
        entityId: relatedEntityId,
        actorId,
        changeSummary: relatedSummary,
        requestId: relatedRequestId
      });
    }
  });
}

async function mutateHomepageV2Draft(updater: (current: HomepageCmsV2Content) => HomepageCmsV2Content) {
  const actorId = await currentActorId();
  const current = await loadAdminSettingsPayload();
  const homepageStored = isPlainRecord(current.homepage) ? current.homepage : {};
  const v2Stored = isPlainRecord(homepageStored.v2) ? homepageStored.v2 : {};
  const draftStored = isPlainRecord(homepageStored.draftV2) ? homepageStored.draftV2 : v2Stored;
  const mergedDraft = updater(mergeHomepageCmsV2Content(draftStored));
  const nextPayload = {
    ...current,
    homepage: {
      ...homepageStored,
      draftV2: mergedDraft
    },
    updated_by: actorId,
    updated_at: new Date().toISOString()
  };
  const supabase = adminSettingsClient();
  const { error } = await supabase.from("admin_settings").upsert(
    { id: "global", payload: nextPayload, updated_by: actorId, updated_at: nextPayload.updated_at },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Failed to save homepage draft: ${error.message}`);
}

function homepageV2MediaUrls(content: HomepageCmsV2Content) {
  return [
    ...content.miniCarousel.slides.map((slide) => slide.imageSrc),
    ...content.banners.interShelf.map((banner) => banner.imageSrc),
    ...content.banners.fullViewport.flatMap((banner) => [banner.desktopImageSrc, banner.mobileImageSrc]),
    ...content.relatedArticles.items.map((item) => item.imageSrc)
  ].filter(Boolean);
}

function collectMediaUrls(value: unknown, output: string[] = []) {
  if (typeof value === "string") {
    if (/^https?:\/\/.+\/storage\/v1\/object\/public\//i.test(value)) output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMediaUrls(item, output);
    return output;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as JsonRecord)) collectMediaUrls(item, output);
  }
  return [...new Set(output)];
}

async function loadHeroBannerImage(id: string) {
  const supabase = adminSettingsClient();
  const { data, error } = await supabase.from("hero_banners").select("image").eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to inspect hero banner media: ${error.message}`);
  return data?.image;
}

async function loadHeroMediaReferences() {
  const supabase = adminSettingsClient();
  const { data, error } = await supabase.from("hero_banners").select("image");
  if (error) throw new Error(`Failed to inspect hero media references: ${error.message}`);
  return data ?? [];
}

async function publishHomepageV2Core() {
  const actorId = await currentActorId();
  const current = await loadAdminSettingsPayload();
  const homepageStored = isPlainRecord(current.homepage) ? current.homepage : {};
  const previousPublished = mergeHomepageCmsV2Content(homepageStored.v2);
  const draftStored = isPlainRecord(homepageStored.draftV2) ? homepageStored.draftV2 : homepageStored.v2;
  const published = mergeHomepageCmsV2Content(draftStored);
  const nextPayload = {
    ...current,
    homepage: {
      ...homepageStored,
      v2: published,
      draftV2: published
    },
    updated_by: actorId,
    updated_at: new Date().toISOString()
  };
  const supabase = adminSettingsClient();
  const { error } = await supabase.from("admin_settings").upsert(
    { id: "global", payload: nextPayload, updated_by: actorId, updated_at: nextPayload.updated_at },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Failed to publish homepage: ${error.message}`);
  await cleanupReplacedCmsMedia({
    oldUrls: homepageV2MediaUrls(previousPublished),
    nextCmsState: nextPayload,
    additionalReferences: await loadHeroMediaReferences()
  });
}

async function publishHomepageV2SectionCore(sectionKey: string, patch: Record<string, unknown>) {
  const actorId = await currentActorId();
  const current = await loadAdminSettingsPayload();
  const homepageStored = isPlainRecord(current.homepage) ? current.homepage : {};
  const previousPublished = mergeHomepageCmsV2Content(homepageStored.v2);
  const draftStored = isPlainRecord(homepageStored.draftV2) ? homepageStored.draftV2 : homepageStored.v2;
  const draftWithPatch = applyHomepageV2SectionPatch(mergeHomepageCmsV2Content(draftStored), sectionKey, patch);
  // Publish only the patched section into live v2; leave other draft sections unpublished.
  const published = applyHomepageV2SectionPatch(previousPublished, sectionKey, extractV2SectionSlice(draftWithPatch, sectionKey));
  const nextDraft = applyHomepageV2SectionPatch(mergeHomepageCmsV2Content(draftStored), sectionKey, extractV2SectionSlice(published, sectionKey));
  const nextPayload = {
    ...current,
    homepage: {
      ...homepageStored,
      v2: published,
      draftV2: nextDraft
    },
    updated_by: actorId,
    updated_at: new Date().toISOString()
  };
  const supabase = adminSettingsClient();
  const { error } = await supabase.from("admin_settings").upsert(
    { id: "global", payload: nextPayload, updated_by: actorId, updated_at: nextPayload.updated_at },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Failed to publish homepage section: ${error.message}`);
  await cleanupReplacedCmsMedia({
    oldUrls: homepageV2MediaUrls(previousPublished),
    nextCmsState: nextPayload,
    additionalReferences: await loadHeroMediaReferences()
  });
}

function extractV2SectionSlice(content: HomepageCmsV2Content, sectionKey: string): Record<string, unknown> {
  if (sectionKey === "mini-carousel") {
    return { enabled: content.miniCarousel.enabled, slides: content.miniCarousel.slides };
  }
  if (sectionKey.startsWith("banner-inter-shelf-")) {
    const index = Number(sectionKey.split("-").pop()) - 1;
    if (index >= 0 && index < 3) return { ...content.banners.interShelf[index] };
  }
  if (sectionKey.startsWith("banner-full-viewport-")) {
    const index = Number(sectionKey.split("-").pop()) - 1;
    if (index >= 0 && index < 2) return { ...content.banners.fullViewport[index] };
  }
  if (sectionKey === "testimonials" || sectionKey === "reviews") {
    return { ...content.reviews };
  }
  if (sectionKey === "related-articles") {
    return { enabled: content.relatedArticles.enabled, items: content.relatedArticles.items };
  }
  return {};
}

function applyHomepageV2SectionPatch(
  current: HomepageCmsV2Content,
  sectionKey: string,
  patch: Record<string, unknown>
): HomepageCmsV2Content {
  if (sectionKey === "mini-carousel") {
    return { ...current, miniCarousel: { ...current.miniCarousel, ...patch } };
  }
  if (sectionKey.startsWith("banner-inter-shelf-")) {
    const index = Number(sectionKey.split("-").pop()) - 1;
    if (index >= 0 && index < 3) {
      const interShelf = [...current.banners.interShelf] as HomepageCmsV2Content["banners"]["interShelf"];
      interShelf[index] = { ...interShelf[index], ...patch } as HomepageCmsV2Content["banners"]["interShelf"][number];
      return { ...current, banners: { ...current.banners, interShelf } };
    }
  }
  if (sectionKey.startsWith("banner-full-viewport-")) {
    const index = Number(sectionKey.split("-").pop()) - 1;
    if (index >= 0 && index < 2) {
      const fullViewport = [...current.banners.fullViewport] as HomepageCmsV2Content["banners"]["fullViewport"];
      fullViewport[index] = { ...fullViewport[index], ...patch } as HomepageCmsV2Content["banners"]["fullViewport"][number];
      return { ...current, banners: { ...current.banners, fullViewport } };
    }
  }
  if (sectionKey === "testimonials" || sectionKey === "reviews") {
    return { ...current, reviews: { ...current.reviews, ...patch } };
  }
  if (sectionKey === "related-articles") {
    return {
      ...current,
      relatedArticles: {
        ...current.relatedArticles,
        ...patch
      } as HomepageCmsV2Content["relatedArticles"]
    };
  }
  return current;
}

async function saveHomepageV2Draft(updater: (current: HomepageCmsV2Content) => HomepageCmsV2Content, successMessage: string) {
  await runCmsFormMutation("homepage_cms_v2", successMessage, async () => {
    await mutateHomepageV2Draft(updater);
  }, "homepage_v2");
}

export async function publishHomepageV2FormAction() {
  await runCmsFormMutation("homepage_cms_v2", "Homepage changes published.", async () => {
    await publishHomepageV2Core();
  }, "homepage_v2");
}

export async function publishHomepageV2ClientAction(): Promise<{ ok: boolean; message: string }> {
  try {
    await requirePermission("cms.write");
    await publishHomepageV2Core();
    await revalidateCmsCutoverPaths("homepage_cms_v2");
    return { ok: true, message: "Homepage changes published." };
  } catch (error) {
    return { ok: false, message: cmsActionMessage(error) };
  }
}

export async function publishHomepageV2SectionFormAction(formData: FormData) {
  const sectionKey = readText(formData, "section_key");
  const patch = buildHomepageV2SectionPatchFromFormData(formData, sectionKey);
  await runCmsFormMutation("homepage_cms_v2", "Section published.", async () => {
    await publishHomepageV2SectionCore(sectionKey, patch);
  }, sectionKey);
}

export async function publishHomepageSectionClientAction(
  sectionKey: string,
  formData?: FormData
): Promise<{ ok: boolean; message: string }> {
  try {
    await requirePermission("cms.write");
    const isV1 =
      sectionKey.startsWith("shelf-") ||
      sectionKey.startsWith("mission-") ||
      sectionKey === "testimonials";
    if (isV1) {
      // For testimonials, also publish the v2 reviews settings slice when form provided.
      if (sectionKey === "testimonials" && formData) {
        const patch = buildHomepageV2SectionPatchFromFormData(formData, sectionKey);
        await persistHomepageV1Draft("testimonials", (current) => current);
        await publishHomepageV1Core();
        await publishHomepageV2SectionCore(sectionKey, patch);
      } else {
        await publishHomepageV1Core();
      }
    } else if (formData) {
      const patch = buildHomepageV2SectionPatchFromFormData(formData, sectionKey);
      await publishHomepageV2SectionCore(sectionKey, patch);
    } else {
      await publishHomepageV2Core();
    }
    await revalidateCmsCutoverPaths("homepage_cms");
    return { ok: true, message: "Section published." };
  } catch (error) {
    return { ok: false, message: cmsActionMessage(error) };
  }
}

export async function saveHomepageV2SectionFormAction(formData: FormData) {
  const sectionKey = readText(formData, "section_key");
  const patch = buildHomepageV2SectionPatchFromFormData(formData, sectionKey);

  await saveHomepageV2Draft((current) => applyHomepageV2SectionPatch(current, sectionKey, patch), "Section draft saved.");
}

function buildHomepageV2SectionPatchFromFormData(formData: FormData, sectionKey: string): Record<string, unknown> {
  if (sectionKey === "mini-carousel") {
    const slideCount = Number(readText(formData, "slide_count", "0"));
    const slides = Array.from({ length: slideCount }, (_, index) => ({
      id: readText(formData, `slide_${index}_id`, `slide-${index}`),
      enabled: readText(formData, `slide_${index}_enabled`, "true") !== "false",
      imageSrc: readText(formData, `slide_${index}_image_src`),
      imageAlt: readText(formData, `slide_${index}_image_alt`),
      heading: readText(formData, `slide_${index}_heading`),
      description: readText(formData, `slide_${index}_description`),
      ctaLabel: readText(formData, `slide_${index}_cta_label`),
      href: readText(formData, `slide_${index}_href`),
      productSlug: readText(formData, `slide_${index}_product_slug`),
      sortOrder: Number(readText(formData, `slide_${index}_sort_order`, String(index))) || index
    }));
    return {
      enabled: readText(formData, "enabled", "true") === "true",
      slides
    };
  }

  if (sectionKey.startsWith("banner-inter-shelf-")) {
    return {
      enabled: readText(formData, "enabled", "true") !== "false",
      heading: readText(formData, "heading"),
      subtitle: readText(formData, "subtitle"),
      ctaLabel: readText(formData, "cta_label"),
      href: readText(formData, "href"),
      imageSrc: readText(formData, "image_src"),
      imageAlt: readText(formData, "image_alt"),
      overlayOpacity: Number(readText(formData, "overlay_opacity", "0.35")) || 0.35,
      alignment: readText(formData, "alignment", "left")
    };
  }

  if (sectionKey.startsWith("banner-full-viewport-")) {
    return {
      enabled: readText(formData, "enabled", "true") !== "false",
      heading: readText(formData, "heading"),
      subtitle: readText(formData, "subtitle"),
      ctaLabel: readText(formData, "cta_label"),
      href: readText(formData, "href"),
      desktopImageSrc: readText(formData, "desktop_image_src"),
      desktopImageAlt: readText(formData, "desktop_image_alt"),
      mobileImageSrc: readText(formData, "mobile_image_src"),
      mobileImageAlt: readText(formData, "mobile_image_alt"),
      overlayOpacity: Number(readText(formData, "overlay_opacity", "0.35")) || 0.35,
      alignment: readText(formData, "alignment", "left")
    };
  }

  if (sectionKey === "reviews" || sectionKey === "testimonials") {
    return {
      enabled: readText(formData, "enabled", "true") !== "false",
      maxCount: Number(readText(formData, "max_count", "6")) || 6,
      sortOrder: readText(formData, "sort_order", "newest")
    };
  }

  if (sectionKey === "related-articles") {
    const count = Math.max(0, Math.min(3, Number(readText(formData, "article_count", "3")) || 3));
    const items = Array.from({ length: count }, (_, index) => ({
      id: readText(formData, `article_${index}_id`, `related-article-${index + 1}`),
      enabled: formData.get(`article_${index}_enabled`) === "on",
      imageSrc: assertOptionalCmsMediaSrc(readText(formData, `article_${index}_image_src`), `Related article ${index + 1} image`),
      imageAlt: readText(formData, `article_${index}_image_alt`),
      eyebrow: readText(formData, `article_${index}_eyebrow`),
      title: readText(formData, `article_${index}_title`),
      content: readText(formData, `article_${index}_content`),
      href: readText(formData, `article_${index}_href`)
    }));
    return {
      enabled: readText(formData, "enabled", "true") !== "false",
      items
    };
  }

  const payloadJson = readText(formData, "payload_json", "{}");
  try {
    return JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid section payload.");
  }
}

export async function uploadCmsFieldImageAction(formData: FormData): Promise<{ ok: boolean; src?: string; alt?: string; mediaAssetId?: string; message?: string }> {
  try {
    await requirePermission("cms.write");
    const bucket = assertAllowedMediaBucket(readText(formData, "bucket", "mithron-products"));
    const uploadedFiles = formData.getAll("files").filter(isUploadFile);
    if (!uploadedFiles.length) {
      return { ok: false, message: "Choose an image before uploading." };
    }
    const file = uploadedFiles[0];
    const mimeType = assertAllowedMediaMimeType(file.type || "application/octet-stream", bucket);
    assertMediaUploadSize(file);
    const actorId = await currentActorId();
    const uploadAt = new Date().toISOString();
    const storagePath = buildStorageObjectPath({
      bucket,
      folder: readText(formData, "folder", "cms"),
      fileName: file.name,
      at: uploadAt
    });
    const buffer = Buffer.from(await file.arrayBuffer());
    const sourceDimensions = await readImageMetadata(buffer, mimeType);
    const publicUrl = await uploadCmsStorageObject(bucket, storagePath, mimeType, buffer);
    const optimizedVariants = await uploadCmsThumbnailVariant(bucket, storagePath, buffer, mimeType);
    const storedPath = storagePath;
    const storedMimeType = mimeType;
    const storedSizeBytes = buffer.byteLength;
    const storedWidth = sourceDimensions.width;
    const storedHeight = sourceDimensions.height;
    const thumbnailVariant = findStoredOptimizedVariant(optimizedVariants, "thumbnail", "webp");
    const webpVariant = thumbnailVariant;
    const avifVariant = findLargestStoredAvifVariant(optimizedVariants);
    const optimizedUploadedBytes = optimizedVariants.reduce((total, variant) => total + variant.sizeBytes, 0) + buffer.byteLength;
    const recordId = buildMediaAssetId(bucket, storedPath);
    const recordForm = buildCmsMediaRecordFormData(formData, {
      id: recordId,
      bucket,
      storage_path: storedPath,
      public_url: publicUrl,
      mime_type: storedMimeType,
      file_size_bytes: String(storedSizeBytes),
      width: storedWidth ? String(storedWidth) : "",
      height: storedHeight ? String(storedHeight) : "",
      thumbnail_path: thumbnailVariant?.storagePath ?? "",
      webp_path: webpVariant?.storagePath ?? "",
      avif_path: avifVariant?.storagePath ?? "",
      responsive_variants: JSON.stringify(buildResponsiveVariantsMetadata(optimizedVariants, {
        width: sourceDimensions.width,
        height: sourceDimensions.height,
        sizeBytes: file.size,
        mimeType,
        storagePath,
        publicUrl,
        uploadedBytes: optimizedUploadedBytes
      })),
      upload_metadata: JSON.stringify({
        original_file_name: file.name,
        original_mime_type: mimeType,
        original_size_bytes: file.size,
        optimized_uploaded_bytes: optimizedUploadedBytes,
        usage_scope: readText(formData, "usage_scope", "cms"),
        source: "admin-cms-editor"
      })
    });
    await upsertMediaAssetRecord(buildMediaAssetRecordFromFormData(recordForm, { actorId, at: uploadAt }), actorId);
    await revalidateCmsCutoverPaths("media_assets");
    return { ok: true, src: publicUrl, alt: readText(formData, "alt"), mediaAssetId: recordId };
  } catch (error) {
    return { ok: false, message: cmsActionMessage(error) };
  }
}

export async function duplicateCmsHomepageSectionFormAction(formData: FormData) {
  const sectionId = readText(formData, "section_id");
  const definition = homepageSectionRegistry.find((entry) => entry.id === sectionId);
  if (!definition?.duplicateEnabled) {
    throw new Error("This section cannot be duplicated.");
  }

  await requirePermission("cms.write");

  if (sectionId.startsWith("banner-inter-shelf-")) {
    const index = Number(sectionId.split("-").pop()) - 1;
    const targetIndex = index < 2 ? index + 1 : index;
    await saveHomepageV2Draft((current) => {
      const interShelf = [...current.banners.interShelf] as HomepageCmsV2Content["banners"]["interShelf"];
      interShelf[targetIndex] = { ...interShelf[index] };
      return { ...current, banners: { ...current.banners, interShelf } };
    }, "Banner duplicated to the next slot.");
    return;
  }

  if (sectionId.startsWith("banner-full-viewport-")) {
    const index = Number(sectionId.split("-").pop()) - 1;
    const targetIndex = index === 0 ? 1 : 0;
    await saveHomepageV2Draft((current) => {
      const fullViewport = [...current.banners.fullViewport] as HomepageCmsV2Content["banners"]["fullViewport"];
      fullViewport[targetIndex] = { ...fullViewport[index] };
      return { ...current, banners: { ...current.banners, fullViewport } };
    }, "Banner duplicated to the next slot.");
    return;
  }

  throw new Error("Duplicate is not implemented for this section type yet.");
}

export async function reorderCmsHomepageSectionsFormAction(formData: FormData) {
  const orderedKeys = readText(formData, "ordered_section_keys")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  if (!orderedKeys.length) return;

  await runCmsFormMutation("homepage_ordering", "Homepage section order saved.", async () => {
    const actorId = await currentActorId();
    for (let index = 0; index < orderedKeys.length; index += 1) {
      await saveCmsWorkflowDraft({
        table: "homepage_ordering",
        identity: { section_key: orderedKeys[index]! },
        fields: {},
        entityId: orderedKeys[index]!,
        sortOrder: (index + 1) * 10,
        isVisible: true,
        changeSummary: `Reorder ${orderedKeys[index]}`,
        actorId
      });
    }
  });
}

export async function toggleCmsSectionVisibilityFormAction(formData: FormData) {
  const sectionKey = readText(formData, "section_key");
  const isVisible = readText(formData, "is_visible") === "true";
  const next = new FormData();
  next.set("section_key", sectionKey);
  next.set("route_path", "/");
  next.set("is_visible", String(isVisible));
  next.set("status", "published");
  await saveSectionVisibilityDraftFormAction(next);
}
