import type { CmsWorkflowDraftInput, HeroBannerDraftInput, HeroBannerStateInput } from "@/services/cms-admin-workflows";
import { assertValidCmsHref } from "@/lib/cms/safe-href";
import { readEditorDocumentFields, readRichTextHtmlField } from "@/lib/editor/read-form-content";
import { CMS_CONTENT_TABLES, CmsValidationError } from "@/services/cms-crud";
import type { CmsContentTable } from "@/services/cms-crud";

export const HERO_MEDIA_FIELD_NAMES = ["image_src", "poster_src", "video_src"] as const;

type SectionVisibilityDraftFormInput = Omit<CmsWorkflowDraftInput, "actorId">;
type HomepageOrderingDraftFormInput = Omit<CmsWorkflowDraftInput, "actorId">;
type CmsPageDraftFormInput = Omit<CmsWorkflowDraftInput, "actorId">;
type CmsSectionDraftFormInput = Omit<CmsWorkflowDraftInput, "actorId">;
type ContentRevisionFormInput = {
  table: string;
  entityId: string;
  snapshot: Record<string, unknown>;
  changeSummary?: string;
};
type ContentRevisionRestoreFormInput = {
  table: string;
  entityId: string;
  revision: number;
  snapshot: Record<string, unknown>;
  changeSummary?: string;
};
type SiteNavigationDraftFormInput = Omit<CmsWorkflowDraftInput, "actorId">;
type FooterColumnDraftFormInput = Omit<CmsWorkflowDraftInput, "actorId">;
type FooterLinkDraftFormInput = Omit<CmsWorkflowDraftInput, "actorId">;
type FaqDraftFormInput = Omit<CmsWorkflowDraftInput, "actorId">;
type ProductReviewDraftFormInput = Omit<CmsWorkflowDraftInput, "actorId">;
type PromotionalCampaignDraftFormInput = Omit<CmsWorkflowDraftInput, "actorId">;
type CategoryMetadataDraftFormInput = Omit<CmsWorkflowDraftInput, "actorId">;
type HeroBannerDraftFormInput = Omit<HeroBannerDraftInput, "actorId">;
type HeroBannerStateFormInput = Omit<HeroBannerStateInput, "actorId">;

function readRequiredString(formData: FormData, key: string, label: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new CmsValidationError(`${label} ${key} is required.`);
  }
  return value.trim();
}

/** Accepts checkbox "on", toggle "true"/"false", and 1/0. */
export function parseFormBoolean(value: FormDataEntryValue | null): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes";
}

function readRichTextHtml(formData: FormData, htmlKey: string, label: string, required = false) {
  try {
    return readRichTextHtmlField(formData, htmlKey, { required, label });
  } catch (error) {
    throw new CmsValidationError(error instanceof Error ? error.message : `${label} ${htmlKey} is required.`);
  }
}

function readOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalInteger(formData: FormData, key: string, label: string) {
  const value = readOptionalString(formData, key);
  if (value === undefined) return undefined;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new CmsValidationError(`${label} must be a non-negative integer.`);
  }
  return numberValue;
}

function readOptionalNumber(formData: FormData, key: string, label: string) {
  const value = readOptionalString(formData, key);
  if (value === undefined) return undefined;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new CmsValidationError(`${label} must be a non-negative number.`);
  }
  return numberValue;
}

function readJsonObject(formData: FormData, key: string, label = "CMS") {
  const value = readOptionalString(formData, key) ?? "{}";

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new CmsValidationError(`${label} ${key} must be a JSON object.`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof CmsValidationError) throw error;
    throw new CmsValidationError(`${label} ${key} must be valid JSON.`);
  }
}

function buildMediaObjectFromSimpleFields(
  formData: FormData,
  prefix: string,
  fallbackAlt: string,
  options: { priority?: boolean } = {}
) {
  const src = readOptionalString(formData, `${prefix}_src`);
  if (!src) return undefined;
  const mobileSrc = readOptionalString(formData, `${prefix}_mobile_src`);
  const mobileAlt = readOptionalString(formData, `${prefix}_mobile_alt`);
  return {
    src,
    alt: readOptionalString(formData, `${prefix}_alt`) ?? fallbackAlt,
    kind: readOptionalString(formData, `${prefix}_kind`) ?? (/\.(mp4|webm|mov)$/i.test(src) ? "video" : "image"),
    local: readOptionalBoolean(formData, `${prefix}_local`, false),
    ...(options.priority ? { priority: true } : {}),
    ...(mobileSrc
      ? {
          mobileOverride: {
            src: mobileSrc,
            alt: mobileAlt ?? fallbackAlt
          }
        }
      : {})
  } as Record<string, unknown>;
}

function readMediaObject(formData: FormData, key: string, label: string, fallbackAlt: string, options: { priority?: boolean } = {}) {
  return buildMediaObjectFromSimpleFields(formData, key, fallbackAlt, options) ?? readJsonObject(formData, key, label);
}

function readOptionalMediaObject(formData: FormData, key: string, label: string, fallbackAlt: string, options: { priority?: boolean } = {}) {
  return buildMediaObjectFromSimpleFields(formData, key, fallbackAlt, options) ?? readOptionalJsonObject(formData, key, label);
}

function readCompositionFromFields(formData: FormData) {
  const existing = readOptionalJsonObject(formData, "composition", "Hero banner");
  return {
    mode: readOptionalString(formData, "composition_mode") ?? String(existing?.mode ?? "full-bleed"),
    textTone: readOptionalString(formData, "composition_text_tone") ?? String(existing?.textTone ?? "dark"),
    mediaPosition: readOptionalString(formData, "composition_media_position") ?? String(existing?.mediaPosition ?? "right center"),
    mobileMediaPosition: readOptionalString(formData, "composition_mobile_media_position") ?? String(existing?.mobileMediaPosition ?? "center center"),
    productDominance: readOptionalString(formData, "composition_product_dominance") ?? String(existing?.productDominance ?? "flagship")
  };
}

function readOptionalJsonObject(formData: FormData, key: string, label: string) {
  const value = readOptionalString(formData, key);
  if (value === undefined) return undefined;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new CmsValidationError(`${label} ${key} must be a JSON object.`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof CmsValidationError) throw error;
    throw new CmsValidationError(`${label} ${key} must be valid JSON.`);
  }
}

function readOptionalStringList(formData: FormData, key: string) {
  const value = readOptionalString(formData, key);
  if (value === undefined) return [];
  return value
    .split(/[\n,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readOptionalTimestamp(formData: FormData, key: string, label: string) {
  const value = readOptionalString(formData, key);
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new CmsValidationError(`${label} must be a valid timestamp.`);
  }
  return value;
}

function readOptionalEnum(formData: FormData, key: string, values: readonly string[], fallback: string, label = key) {
  const value = readOptionalString(formData, key);
  if (value === undefined) return fallback;
  if (!values.includes(value)) {
    throw new CmsValidationError(`${label} must be one of: ${values.join(", ")}.`);
  }
  return value;
}

function readOptionalBoolean(formData: FormData, key: string, fallback = false) {
  const value = formData.get(key);
  if (value === null) return fallback;
  return value === "on" || value === "true" || value === "1";
}

export const CONTENT_REVISION_TARGET_TABLES = CMS_CONTENT_TABLES.filter(
  (table): table is Exclude<CmsContentTable, "content_revisions"> => table !== "content_revisions"
);

function isContentRevisionTargetTable(value: string): value is Exclude<CmsContentTable, "content_revisions"> {
  return CONTENT_REVISION_TARGET_TABLES.includes(value as Exclude<CmsContentTable, "content_revisions">);
}

export function buildSectionVisibilityDraftFromFormData(formData: FormData): SectionVisibilityDraftFormInput {
  const sectionKey = readRequiredString(formData, "section_key", "Section visibility");
  const routePath = readRequiredString(formData, "route_path", "Section visibility");
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "section_visibility",
    identity: {
      section_key: sectionKey,
      route_path: routePath
    },
    fields: {
      section_key: sectionKey,
      route_path: routePath,
      starts_at: readOptionalTimestamp(formData, "starts_at", "Section visibility") ?? null,
      ends_at: readOptionalTimestamp(formData, "ends_at", "Section visibility") ?? null
    },
    entityId: `${sectionKey}:${routePath}`,
    isVisible: parseFormBoolean(formData.get("is_visible")),
    changeSummary: changeSummary ?? `Draft section visibility ${sectionKey} at ${routePath}`
  };
}

export function buildHomepageOrderingDraftFromFormData(formData: FormData): HomepageOrderingDraftFormInput {
  const sectionKey = readRequiredString(formData, "section_key", "Homepage ordering");
  const sortOrder = readOptionalInteger(formData, "sort_order", "Homepage ordering sort order");
  if (sortOrder === undefined) {
    throw new CmsValidationError("Homepage ordering sort_order is required.");
  }
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "homepage_ordering",
    identity: {
      section_key: sectionKey
    },
    fields: {},
    entityId: sectionKey,
    sortOrder,
    isVisible: formData.get("is_visible") === "on",
    changeSummary: changeSummary ?? `Draft homepage ordering ${sectionKey}`
  };
}

export function buildCmsPageDraftFromFormData(formData: FormData): CmsPageDraftFormInput {
  const id = readRequiredString(formData, "id", "CMS page");
  const slug = readRequiredString(formData, "slug", "CMS page");
  const title = readRequiredString(formData, "title", "CMS page");
  const routePath = readRequiredString(formData, "route_path", "CMS page");
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "cms_pages",
    identity: {
      id,
      slug
    },
    fields: {
      title,
      route_path: routePath,
      meta_title: readOptionalString(formData, "meta_title") ?? null,
      meta_description: readOptionalString(formData, "meta_description") ?? null,
      payload: readJsonObject(formData, "payload", "CMS page")
    },
    entityId: slug,
    sortOrder: readOptionalInteger(formData, "sort_order", "CMS page sort order"),
    isVisible: formData.get("is_visible") === "on",
    changeSummary: changeSummary ?? `Draft CMS page ${slug}`
  };
}

export function buildCmsSectionDraftFromFormData(formData: FormData): CmsSectionDraftFormInput {
  const pageId = readRequiredString(formData, "page_id", "CMS section");
  const sectionKey = readRequiredString(formData, "section_key", "CMS section");
  const componentKey = readRequiredString(formData, "component_key", "CMS section");
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "cms_sections",
    identity: {
      page_id: pageId,
      section_key: sectionKey
    },
    fields: {
      component_key: componentKey,
      title: readOptionalString(formData, "title") ?? null,
      payload: readJsonObject(formData, "payload", "CMS section")
    },
    entityId: `${pageId}:${sectionKey}`,
    sortOrder: readOptionalInteger(formData, "sort_order", "CMS section sort order"),
    isVisible: formData.get("is_visible") === "on",
    changeSummary: changeSummary ?? `Draft CMS section ${pageId}/${sectionKey}`
  };
}

export function buildHeroBannerDraftFromFormData(formData: FormData): HeroBannerDraftFormInput {
  const id = readRequiredString(formData, "id", "Hero banner");
  const title = readRequiredString(formData, "title", "Hero banner");
  const changeSummary = readOptionalString(formData, "change_summary");
  const theme = readOptionalEnum(formData, "theme", ["light", "dark"], "light", "Hero banner theme") as "light" | "dark";

  return {
    id,
    productSlug: readOptionalString(formData, "product_slug") ?? null,
    title,
    subtitle: readRequiredString(formData, "subtitle", "Hero banner"),
    ctaLabel: readRequiredString(formData, "cta_label", "Hero banner"),
    href: assertValidCmsHref(readRequiredString(formData, "href", "Hero banner"), "Hero banner"),
    image: readMediaObject(formData, "image", "Hero banner", title, { priority: true }),
    poster: readOptionalMediaObject(formData, "poster", "Hero banner", title) ?? null,
    video: readOptionalMediaObject(formData, "video", "Hero banner", title) ?? null,
    theme,
    composition: readCompositionFromFields(formData),
    titleColor: readOptionalString(formData, "title_color") ?? null,
    subtitleColor: readOptionalString(formData, "subtitle_color") ?? null,
    startsAt: readOptionalTimestamp(formData, "starts_at", "Hero banner starts_at") ?? null,
    endsAt: readOptionalTimestamp(formData, "ends_at", "Hero banner ends_at") ?? null,
    sortOrder: readOptionalInteger(formData, "sort_order", "Hero banner sort order"),
    isVisible: readOptionalBoolean(formData, "is_visible", true),
    changeSummary: changeSummary ?? `Draft hero banner ${title}`
  };
}

export function buildHeroBannerStateFromFormData(formData: FormData): HeroBannerStateFormInput {
  const id = readRequiredString(formData, "id", "Hero banner");
  const changeSummary = readOptionalString(formData, "change_summary");
  return {
    id,
    changeSummary: changeSummary ?? `Update hero banner ${id}`
  };
}

export function buildContentRevisionRecordFromFormData(formData: FormData): ContentRevisionFormInput {
  const table = readRequiredString(formData, "entity_table", "Content revision");
  if (table === "content_revisions") {
    throw new CmsValidationError("Content revision entity_table cannot target content_revisions.");
  }
  if (!isContentRevisionTargetTable(table)) {
    throw new CmsValidationError("Content revision entity_table must be a supported CMS table.");
  }

  const entityId = readRequiredString(formData, "entity_id", "Content revision");
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table,
    entityId,
    snapshot: readJsonObject(formData, "snapshot", "Content revision"),
    changeSummary: changeSummary ?? `Record ${table} content revision`
  };
}

export function buildContentRevisionRestoreFromFormData(formData: FormData): ContentRevisionRestoreFormInput {
  const table = readRequiredString(formData, "entity_table", "Content revision restore");
  if (table === "content_revisions") {
    throw new CmsValidationError("Content revision restore entity_table cannot target content_revisions.");
  }
  if (!isContentRevisionTargetTable(table)) {
    throw new CmsValidationError("Content revision restore entity_table must be a supported CMS table.");
  }

  const entityId = readRequiredString(formData, "entity_id", "Content revision restore");
  const revision = readOptionalInteger(formData, "revision", "Content revision restore revision");
  if (revision === undefined || revision < 1) {
    throw new CmsValidationError("Content revision restore revision is required.");
  }
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table,
    entityId,
    revision,
    snapshot: readJsonObject(formData, "snapshot", "Content revision restore"),
    changeSummary: changeSummary ?? `Restore ${table} revision ${revision}`
  };
}

export function buildSiteNavigationDraftFromFormData(formData: FormData): SiteNavigationDraftFormInput {
  const id = readRequiredString(formData, "id", "Site navigation");
  const label = readRequiredString(formData, "label", "Site navigation");
  const href = assertValidCmsHref(readRequiredString(formData, "href", "Site navigation"), "Site navigation");
  const placement = readOptionalEnum(formData, "placement", ["primary", "secondary"], "primary", "Site navigation placement");
  const parentId = readOptionalString(formData, "parent_id") ?? null;
  const requiredRole = readOptionalString(formData, "required_role") ?? null;
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "site_navigation",
    identity: {
      id
    },
    fields: {
      label,
      href,
      placement,
      parent_id: parentId,
      required_role: requiredRole
    },
    entityId: id,
    sortOrder: readOptionalInteger(formData, "sort_order", "sort order"),
    isVisible: formData.get("is_visible") === "on",
    changeSummary: changeSummary ?? `Draft navigation item ${label}`
  };
}

export function buildFooterColumnDraftFromFormData(formData: FormData): FooterColumnDraftFormInput {
  const id = readRequiredString(formData, "id", "Footer column");
  const title = readRequiredString(formData, "title", "Footer column");
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "footer_columns",
    identity: {
      id
    },
    fields: {
      title
    },
    entityId: id,
    sortOrder: readOptionalInteger(formData, "sort_order", "Footer column sort order"),
    isVisible: formData.get("is_visible") === "on",
    changeSummary: changeSummary ?? `Draft footer column ${title}`
  };
}

export function buildFooterLinkDraftFromFormData(formData: FormData): FooterLinkDraftFormInput {
  const id = readRequiredString(formData, "id", "Footer link");
  const columnId = readRequiredString(formData, "column_id", "Footer link");
  const label = readRequiredString(formData, "label", "Footer link");
  const href = assertValidCmsHref(readRequiredString(formData, "href", "Footer link"), "Footer link");
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "footer_links",
    identity: {
      id
    },
    fields: {
      column_id: columnId,
      label,
      href
    },
    entityId: id,
    sortOrder: readOptionalInteger(formData, "sort_order", "Footer link sort order"),
    isVisible: formData.get("is_visible") === "on",
    changeSummary: changeSummary ?? `Draft footer link ${label}`
  };
}

export function buildFaqDraftFromFormData(formData: FormData): FaqDraftFormInput {
  const id = readRequiredString(formData, "id", "FAQ");
  const scope = readOptionalEnum(formData, "scope", ["global", "product"], "global", "FAQ scope");
  const productSlug = readOptionalString(formData, "product_slug") ?? null;
  const question = readRequiredString(formData, "question", "FAQ");
  const answer = readRichTextHtml(formData, "answer", "FAQ", true);
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "faqs",
    identity: {
      id
    },
    fields: {
      scope,
      product_slug: productSlug,
      question,
      answer
    },
    entityId: id,
    sortOrder: readOptionalInteger(formData, "sort_order", "FAQ sort order"),
    isVisible: formData.get("is_visible") === "on",
    changeSummary: changeSummary ?? `Draft FAQ ${question}`
  };
}

export function buildProductReviewDraftFromFormData(formData: FormData): ProductReviewDraftFormInput {
  const id = readRequiredString(formData, "id", "Product review");
  const reviewerName = readRequiredString(formData, "reviewer_name", "Product review");
  const body = readRichTextHtml(formData, "body", "Product review", true);
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "product_reviews",
    identity: {
      id
    },
    fields: {
      reviewer_name: reviewerName,
      product_slug: readOptionalString(formData, "product_slug") ?? null,
      body,
      rating: readOptionalNumber(formData, "rating", "Product review rating") ?? null
    },
    entityId: id,
    sortOrder: readOptionalInteger(formData, "sort_order", "Product review sort order"),
    isVisible: formData.get("is_visible") === "on",
    changeSummary: changeSummary ?? `Draft product review ${reviewerName}`
  };
}

export function buildPromotionalCampaignDraftFromFormData(formData: FormData): PromotionalCampaignDraftFormInput {
  const id = readRequiredString(formData, "id", "Promotional campaign");
  const label = readRequiredString(formData, "label", "Promotional campaign");
  const headline = readRequiredString(formData, "headline", "Promotional campaign");
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "promotional_campaigns",
    identity: {
      id
    },
    fields: {
      label,
      headline,
      body: readRichTextHtml(formData, "body", "Promotional campaign") || null,
      cta_label: readOptionalString(formData, "cta_label") ?? null,
      href: (() => {
        const rawHref = readOptionalString(formData, "href");
        return rawHref ? assertValidCmsHref(rawHref, "Promotional campaign") : null;
      })(),
      media_asset_id: readOptionalString(formData, "media_asset_id") ?? null,
      starts_at: readOptionalTimestamp(formData, "starts_at", "Promotional campaign starts_at") ?? null,
      ends_at: readOptionalTimestamp(formData, "ends_at", "Promotional campaign ends_at") ?? null
    },
    entityId: id,
    sortOrder: readOptionalInteger(formData, "sort_order", "Promotional campaign sort order"),
    isVisible: formData.get("is_visible") === "on",
    changeSummary: changeSummary ?? `Draft promotional campaign ${label}`
  };
}

export function buildCategoryMetadataDraftFromFormData(formData: FormData): CategoryMetadataDraftFormInput {
  const routeKey = readRequiredString(formData, "route_key", "Category metadata");
  const title = readRequiredString(formData, "title", "Category metadata");
  const subtitle = readRequiredString(formData, "subtitle", "Category metadata");
  const heroImage = readRequiredString(formData, "hero_image", "Category metadata");
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "category_metadata",
    identity: {
      route_key: routeKey
    },
    fields: {
      title,
      subtitle,
      hero_image: heroImage,
      showcase_image: readOptionalJsonObject(formData, "showcase_image", "Category metadata") ?? null,
      personality: readOptionalString(formData, "personality") ?? null,
      featured_product_slugs: readOptionalStringList(formData, "featured_product_slugs"),
      ecosystem_payload: readJsonObject(formData, "ecosystem_payload", "Category metadata")
    },
    entityId: routeKey,
    sortOrder: readOptionalInteger(formData, "sort_order", "Category metadata sort order"),
    isVisible: formData.get("is_visible") === "on",
    changeSummary: changeSummary ?? `Draft category metadata ${routeKey}`
  };
}
