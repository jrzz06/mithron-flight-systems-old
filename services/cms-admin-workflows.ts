import {
  archiveCmsRecord,
  publishCmsRecord,
  saveCmsDraft,
  CmsValidationError,
  getDefaultCmsConflictColumn
} from "@/services/cms-crud";
import { assertWritableCmsTable } from "@/lib/cms/deprecated-tables";
import { CMS_DEPRECATED_STOREFRONT_TABLES } from "@/config/cms-deprecations";

type JsonRecord = Record<string, unknown>;
type DraftWriteInput = Parameters<typeof saveCmsDraft>[0];
type StateWriteInput = Parameters<typeof publishCmsRecord>[0];

type HeroMedia = JsonRecord & {
  src?: unknown;
  alt?: unknown;
};

type HeroBannerBaseInput = {
  id: string;
  actorId: string | null;
  now?: string | Date;
  changeSummary?: string | null;
  requestId?: string | null;
};

export type HeroBannerDraftInput = HeroBannerBaseInput & {
  productSlug?: string | null;
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
  image: HeroMedia;
  poster?: HeroMedia | null;
  video?: HeroMedia | null;
  theme?: "light" | "dark";
  composition?: JsonRecord;
  startsAt?: string | null;
  endsAt?: string | null;
  sortOrder?: number;
  isVisible?: boolean;
  fields?: JsonRecord;
  /** CSS color string for the hero title text, e.g. "#ffffff". Null clears any override. */
  titleColor?: string | null;
  /** CSS color string for the hero subtitle text. */
  subtitleColor?: string | null;
};

export type HeroBannerStateInput = HeroBannerBaseInput;

type SaveHeroBannerDependencies = {
  saveDraft?: (input: DraftWriteInput) => Promise<JsonRecord>;
};

type HeroBannerStateDependencies = {
  publishRecord?: (input: StateWriteInput) => Promise<JsonRecord>;
  archiveRecord?: (input: StateWriteInput) => Promise<JsonRecord>;
};

export const HERO_BANNER_CMS_TABLE = "hero_banners";

/** Tables kept for legacy data but excluded from storefront/editor active paths. */
export const CMS_DEPRECATED_WORKFLOW_TABLES = CMS_DEPRECATED_STOREFRONT_TABLES;

export const CMS_WORKFLOW_TABLES = [
  "section_visibility",
  "homepage_ordering",
  "cms_pages",
  "cms_sections",
  "site_navigation",
  "footer_columns",
  "footer_links",
  "faqs",
  "product_reviews",
  "promotional_campaigns",
  "category_metadata"
] as const;

export type CmsWorkflowTable = (typeof CMS_WORKFLOW_TABLES)[number];

export type CmsWorkflowDraftInput = {
  table: string;
  actorId: string | null;
  identity: JsonRecord;
  fields: JsonRecord;
  entityId?: string;
  sortOrder?: number;
  isVisible?: boolean;
  now?: string | Date;
  changeSummary?: string | null;
  requestId?: string | null;
};

export type CmsWorkflowStateInput = {
  table: string;
  actorId: string | null;
  entityId: string;
  now?: string | Date;
  changeSummary?: string | null;
  requestId?: string | null;
};

type CmsWorkflowDefinition = {
  requiredIdentity: readonly string[];
  requiredFields: readonly string[];
  defaultFields?: JsonRecord;
  includeAuditFields?: boolean;
};

type SaveCmsWorkflowDependencies = {
  saveDraft?: (input: DraftWriteInput) => Promise<JsonRecord>;
};

type CmsWorkflowStateDependencies = {
  publishRecord?: (input: StateWriteInput) => Promise<JsonRecord>;
  archiveRecord?: (input: StateWriteInput) => Promise<JsonRecord>;
};

const cmsWorkflowDefinitions: Record<CmsWorkflowTable, CmsWorkflowDefinition> = {
  section_visibility: {
    requiredIdentity: ["section_key", "route_path"],
    requiredFields: ["section_key", "route_path"],
    includeAuditFields: false,
    defaultFields: {
      starts_at: null,
      ends_at: null
    }
  },
  homepage_ordering: {
    requiredIdentity: ["section_key"],
    requiredFields: [],
    includeAuditFields: false
  },
  cms_pages: {
    requiredIdentity: ["id", "slug"],
    requiredFields: ["title", "route_path"],
    defaultFields: {
      meta_title: null,
      meta_description: null,
      payload: {}
    }
  },
  cms_sections: {
    requiredIdentity: ["page_id", "section_key"],
    requiredFields: ["component_key"],
    defaultFields: {
      title: null,
      payload: {}
    }
  },
  site_navigation: {
    requiredIdentity: ["id"],
    requiredFields: ["label", "href"],
    defaultFields: { placement: "primary", parent_id: null, required_role: null }
  },
  footer_columns: {
    requiredIdentity: ["id"],
    requiredFields: ["title"]
  },
  footer_links: {
    requiredIdentity: ["id"],
    requiredFields: ["column_id", "label", "href"]
  },
  faqs: {
    requiredIdentity: ["id"],
    requiredFields: ["question", "answer"],
    defaultFields: { scope: "global", product_slug: null }
  },
  product_reviews: {
    requiredIdentity: ["id"],
    requiredFields: ["reviewer_name", "body"],
    defaultFields: { product_slug: null, rating: null }
  },
  promotional_campaigns: {
    requiredIdentity: ["id"],
    requiredFields: ["label", "headline"],
    defaultFields: {
      body: null,
      cta_label: null,
      href: null,
      media_asset_id: null,
      starts_at: null,
      ends_at: null
    }
  },
  category_metadata: {
    requiredIdentity: ["route_key"],
    requiredFields: ["title", "subtitle", "hero_image"],
    defaultFields: {
      showcase_image: null,
      personality: null,
      featured_product_slugs: [],
      ecosystem_payload: {}
    }
  }
};

const protectedHeroFields = new Set([
  "status",
  "revision",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "is_visible",
  "sort_order"
]);

function isPlainRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCmsWorkflowTable(table: string): table is CmsWorkflowTable {
  return (CMS_WORKFLOW_TABLES as readonly string[]).includes(table);
}

function getCmsWorkflowDefinition(table: string) {
  if (!isCmsWorkflowTable(table)) {
    throw new CmsValidationError(`Unsupported CMS workflow table: ${table}.`);
  }

  return cmsWorkflowDefinitions[table];
}

function assertNonEmptyString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new CmsValidationError(`Hero banner ${label} is required.`);
  }
  return value.trim();
}

function assertActorId(actorId: string | null) {
  return assertNonEmptyString(actorId, "actor id");
}

function assertHeroMedia(value: unknown, label: string) {
  if (!isPlainRecord(value)) {
    throw new CmsValidationError(`Hero banner ${label} media must be a plain object.`);
  }

  assertNonEmptyString((value as HeroMedia).src, `${label} media src`);
  assertNonEmptyString((value as HeroMedia).alt, `${label} media alt`);
  return value;
}

function assertOptionalHeroMedia(value: unknown, label: string) {
  if (value === null || value === undefined) return value as null | undefined;
  return assertHeroMedia(value, label);
}

function sanitizeExtraFields(fields: JsonRecord | undefined) {
  if (!fields) return {};
  if (!isPlainRecord(fields)) {
    throw new CmsValidationError("Hero banner extra fields must be a plain object.");
  }

  return Object.fromEntries(
    Object.entries(fields).filter(([key]) => !protectedHeroFields.has(key))
  );
}

function sanitizeWorkflowFields(fields: JsonRecord) {
  if (!isPlainRecord(fields)) {
    throw new CmsValidationError("CMS workflow fields must be a plain object.");
  }

  return Object.fromEntries(
    Object.entries(fields).filter(([key]) => !protectedHeroFields.has(key))
  );
}

function assertRequiredRecordFields(record: JsonRecord, requiredFields: readonly string[], label: string) {
  for (const field of requiredFields) {
    assertNonEmptyString(record[field], `${label} ${field}`);
  }
}

function normalizeTheme(theme: HeroBannerDraftInput["theme"]) {
  if (!theme) return "light";
  if (theme !== "light" && theme !== "dark") {
    throw new CmsValidationError("Hero banner theme must be light or dark.");
  }
  return theme;
}

function mutationInput(input: HeroBannerStateInput): StateWriteInput {
  return {
    table: HERO_BANNER_CMS_TABLE,
    idColumn: "id",
    idValue: assertNonEmptyString(input.id, "id"),
    actorId: assertActorId(input.actorId),
    now: input.now,
    changeSummary: input.changeSummary ?? null,
    requestId: input.requestId ?? null
  };
}

function cmsWorkflowStateMutationInput(input: CmsWorkflowStateInput): StateWriteInput {
  getCmsWorkflowDefinition(input.table);
  const conflictColumn = getDefaultCmsConflictColumn(input.table);

  return {
    table: input.table,
    idColumn: conflictColumn,
    idValue: assertNonEmptyString(input.entityId, "entity id"),
    actorId: assertActorId(input.actorId),
    now: input.now,
    changeSummary: input.changeSummary ?? null,
    requestId: input.requestId ?? null
  };
}

export function buildCmsWorkflowDraftInput(input: CmsWorkflowDraftInput): DraftWriteInput {
  const definition = getCmsWorkflowDefinition(input.table);
  const actorId = assertActorId(input.actorId);

  if (!isPlainRecord(input.identity) || !isPlainRecord(input.fields)) {
    throw new CmsValidationError("CMS workflow identity and fields must be plain objects.");
  }

  assertRequiredRecordFields(input.identity, definition.requiredIdentity, `${input.table} identity`);
  const fields = {
    ...(definition.defaultFields ?? {}),
    ...sanitizeWorkflowFields(input.fields)
  };
  assertRequiredRecordFields(fields, definition.requiredFields, `${input.table} field`);

  return {
    table: input.table,
    conflictColumn: getDefaultCmsConflictColumn(input.table),
    actorId,
    identity: input.identity,
    fields,
    sortOrder: input.sortOrder,
    isVisible: input.isVisible,
    now: input.now,
    includeAuditFields: definition.includeAuditFields
  };
}

export async function saveCmsWorkflowDraft(
  input: CmsWorkflowDraftInput,
  dependencies: SaveCmsWorkflowDependencies = {}
) {
  assertWritableCmsTable(input.table);
  const draftInput = buildCmsWorkflowDraftInput(input);
  const saveDraftImpl = dependencies.saveDraft ?? saveCmsDraft;
  const record = await saveDraftImpl(draftInput);
  return record;
}

export async function publishCmsWorkflowRecord(
  input: CmsWorkflowStateInput,
  dependencies: CmsWorkflowStateDependencies = {}
) {
  assertWritableCmsTable(input.table);
  const publishRecordImpl = dependencies.publishRecord ?? publishCmsRecord;
  const stateInput = cmsWorkflowStateMutationInput(input);
  return publishRecordImpl(stateInput);
}

export async function archiveCmsWorkflowRecord(
  input: CmsWorkflowStateInput,
  dependencies: CmsWorkflowStateDependencies = {}
) {
  const archiveRecordImpl = dependencies.archiveRecord ?? archiveCmsRecord;
  const stateInput = cmsWorkflowStateMutationInput(input);
  return archiveRecordImpl(stateInput);
}

export function buildHeroBannerDraftInput(input: HeroBannerDraftInput): DraftWriteInput {
  const id = assertNonEmptyString(input.id, "id");
  const actorId = assertActorId(input.actorId);
  const composition = input.composition ?? {};

  if (!isPlainRecord(composition)) {
    throw new CmsValidationError("Hero banner composition must be a plain object.");
  }

  const fields: JsonRecord = {
    ...sanitizeExtraFields(input.fields),
    product_slug: input.productSlug ?? null,
    title: assertNonEmptyString(input.title, "title"),
    subtitle: assertNonEmptyString(input.subtitle, "subtitle"),
    cta_label: assertNonEmptyString(input.ctaLabel, "CTA label"),
    href: assertNonEmptyString(input.href, "href"),
    image: assertHeroMedia(input.image, "image"),
    poster: assertOptionalHeroMedia(input.poster, "poster") ?? null,
    video: assertOptionalHeroMedia(input.video, "video") ?? null,
    theme: normalizeTheme(input.theme),
    composition,
    title_color: input.titleColor ?? null,
    subtitle_color: input.subtitleColor ?? null,
    starts_at: input.startsAt ?? null,
    ends_at: input.endsAt ?? null
  };

  return {
    table: HERO_BANNER_CMS_TABLE,
    conflictColumn: "id",
    actorId,
    identity: { id },
    fields,
    sortOrder: input.sortOrder,
    isVisible: input.isVisible,
    now: input.now
  };
}

export async function saveHeroBannerDraftWorkflow(
  input: HeroBannerDraftInput,
  dependencies: SaveHeroBannerDependencies = {}
) {
  const draftInput = buildHeroBannerDraftInput(input);
  const saveDraftImpl = dependencies.saveDraft ?? saveCmsDraft;
  return saveDraftImpl(draftInput);
}

export async function publishHeroBannerWorkflow(
  input: HeroBannerStateInput,
  dependencies: HeroBannerStateDependencies = {}
) {
  const publishRecordImpl = dependencies.publishRecord ?? publishCmsRecord;
  const stateInput = mutationInput(input);
  return publishRecordImpl(stateInput);
}

export async function archiveHeroBannerWorkflow(
  input: HeroBannerStateInput,
  dependencies: HeroBannerStateDependencies = {}
) {
  const archiveRecordImpl = dependencies.archiveRecord ?? archiveCmsRecord;
  const stateInput = mutationInput(input);
  return archiveRecordImpl(stateInput);
}
