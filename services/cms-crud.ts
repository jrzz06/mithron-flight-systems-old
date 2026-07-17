import {
  mutateCmsContentWithRevision,
  recordEntityRevisionSnapshot,
  upsertAdminRecord
} from "@/services/admin-actions";

type EnvSource = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

export const CMS_CONTENT_TABLES = [
  "hero_banners",
  "cms_pages",
  "cms_sections",
  "site_navigation",
  "footer_columns",
  "footer_links",
  "category_metadata",
  "trust_cards",
  "product_reviews",
  "faqs",
  "promotional_campaigns",
  "section_visibility",
  "homepage_ordering",
  "content_revisions"
] as const;

export type CmsContentTable = (typeof CMS_CONTENT_TABLES)[number];
export type CmsPublishStatus = "draft" | "published" | "archived" | "scheduled";

type CmsDraftInput = {
  table: string;
  actorId: string | null;
  identity: JsonRecord;
  fields: JsonRecord;
  sortOrder?: number;
  isVisible?: boolean;
  now?: string | Date;
  includeAuditFields?: boolean;
};

type CmsStatePatchInput = {
  table?: string;
  actorId: string | null;
  now?: string | Date;
  changeSummary?: string | null;
  requestId?: string | null;
};

type ContentRevisionInput = {
  table: string;
  entityId: string;
  revision?: number | null;
  actorId: string | null;
  snapshot: JsonRecord;
  changeSummary?: string | null;
};

type ContentRevisionRestoreInput = {
  table: string;
  entityId: string;
  actorId: string | null;
  snapshot: JsonRecord;
  changeSummary?: string | null;
  now?: string | Date;
  requestId?: string | null;
};

type SaveCmsDraftInput = CmsDraftInput & {
  conflictColumn?: string;
};

type MutateCmsRecordInput = CmsStatePatchInput & {
  table: string;
  idColumn?: string;
  idValue: string;
};

const protectedPayloadKeys = new Set([
  "status",
  "revision",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "is_visible",
  "sort_order"
]);

const protectedRestorePayloadKeys = new Set([
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "revision"
]);

const defaultConflictColumns: Record<CmsContentTable, string> = {
  hero_banners: "id",
  cms_pages: "slug",
  cms_sections: "page_id,section_key",
  site_navigation: "id",
  footer_columns: "id",
  footer_links: "id",
  category_metadata: "route_key",
  trust_cards: "id",
  product_reviews: "id",
  faqs: "id",
  promotional_campaigns: "id",
  section_visibility: "section_key,route_path",
  homepage_ordering: "section_key",
  content_revisions: "id"
};

const cmsTableColumns: Record<CmsContentTable, readonly string[]> = {
  hero_banners: [
    "id", "product_slug", "title", "subtitle", "cta_label", "href", "image", "poster", "video", "theme",
    "composition", "title_color", "subtitle_color", "sort_order", "is_visible", "status", "starts_at", "ends_at",
    "revision", "created_by", "updated_by", "created_at", "updated_at"
  ],
  cms_pages: [
    "id", "slug", "title", "meta_title", "meta_description", "route_path", "payload", "sort_order", "is_visible",
    "status", "revision", "created_by", "updated_by", "created_at", "updated_at"
  ],
  cms_sections: [
    "id", "page_id", "section_key", "component_key", "title", "payload", "sort_order", "is_visible", "status",
    "revision", "created_by", "updated_by", "created_at", "updated_at"
  ],
  site_navigation: [
    "id", "label", "href", "placement", "parent_id", "required_role", "sort_order", "is_visible", "status",
    "revision", "created_at", "updated_at"
  ],
  footer_columns: [
    "id", "title", "sort_order", "is_visible", "status", "revision", "created_at", "updated_at"
  ],
  footer_links: [
    "id", "column_id", "label", "href", "sort_order", "is_visible", "status", "revision", "created_at", "updated_at"
  ],
  category_metadata: [
    "route_key", "title", "subtitle", "hero_image", "showcase_image", "personality", "featured_product_slugs",
    "ecosystem_payload", "sort_order", "is_visible", "status", "revision", "created_at", "updated_at"
  ],
  trust_cards: [
    "id", "icon", "title", "body", "image_src", "image_alt", "image_class_name", "class_name",
    "image_stage_class_name", "is_feature", "sort_order", "is_visible", "status", "revision", "created_at", "updated_at"
  ],
  product_reviews: [
    "id", "product_slug", "reviewer_name", "body", "rating", "sort_order", "is_visible", "status", "revision",
    "created_at", "updated_at"
  ],
  faqs: [
    "id", "scope", "product_slug", "question", "answer", "sort_order", "is_visible", "status", "revision",
    "created_at", "updated_at"
  ],
  promotional_campaigns: [
    "id", "label", "headline", "body", "cta_label", "href", "media_asset_id", "starts_at", "ends_at",
    "sort_order", "is_visible", "status", "revision", "created_at", "updated_at"
  ],
  section_visibility: [
    "id", "section_key", "route_path", "is_visible", "starts_at", "ends_at", "status", "created_at"
  ],
  homepage_ordering: [
    "section_key", "sort_order", "is_visible", "status", "updated_at"
  ],
  content_revisions: [
    "id", "entity_table", "entity_id", "revision", "snapshot", "change_summary", "created_by", "created_at"
  ]
};

export class CmsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CmsValidationError";
  }
}

function isPlainRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isCmsContentTable(table: string): table is CmsContentTable {
  return (CMS_CONTENT_TABLES as readonly string[]).includes(table);
}

function assertCmsContentTable(table: string): asserts table is CmsContentTable {
  if (!isCmsContentTable(table)) {
    throw new CmsValidationError(`Unsupported CMS content table: ${table}.`);
  }
}

function assertActorId(actorId: string | null): asserts actorId is string {
  if (!actorId || !actorId.trim()) {
    throw new CmsValidationError("CMS mutations require an authenticated actor id.");
  }
}

function normalizeTimestamp(now: string | Date | undefined) {
  if (!now) return new Date().toISOString();
  if (now instanceof Date) return now.toISOString();
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) {
    throw new CmsValidationError("CMS mutation timestamp is invalid.");
  }
  return parsed.toISOString();
}

function normalizeSortOrder(input: CmsDraftInput) {
  if (input.sortOrder !== undefined) {
    if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0) {
      throw new CmsValidationError("CMS sort order must be a non-negative integer.");
    }
    return input.sortOrder;
  }

  const rawSortOrder = input.fields.sort_order;
  if (rawSortOrder === undefined || rawSortOrder === null || rawSortOrder === "") {
    return undefined;
  }

  const numericSortOrder = Number(rawSortOrder);
  if (!Number.isFinite(numericSortOrder) || numericSortOrder < 0) {
    throw new CmsValidationError("CMS sort order must be a non-negative number.");
  }

  return numericSortOrder;
}

function sanitizeFields(fields: JsonRecord) {
  if (!isPlainRecord(fields)) {
    throw new CmsValidationError("CMS payload fields must be a plain object.");
  }

  return Object.fromEntries(
    Object.entries(fields).filter(([key]) => !protectedPayloadKeys.has(key))
  );
}

function sanitizeRestoreSnapshot(snapshot: JsonRecord) {
  if (!isPlainRecord(snapshot)) {
    throw new CmsValidationError("CMS restore snapshot must be a plain object.");
  }

  return Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => !protectedRestorePayloadKeys.has(key))
  );
}

function normalizeIdentity(identity: JsonRecord) {
  if (!isPlainRecord(identity) || !Object.keys(identity).length) {
    throw new CmsValidationError("CMS payload requires at least one identity field.");
  }

  for (const [key, value] of Object.entries(identity)) {
    if (!key || value === null || value === undefined || String(value).trim() === "") {
      throw new CmsValidationError("CMS identity fields must be non-empty.");
    }
  }

  return identity;
}

export function getDefaultCmsConflictColumn(table: string) {
  assertCmsContentTable(table);
  return defaultConflictColumns[table];
}

function getCmsTableColumnSet(table: string) {
  assertCmsContentTable(table);
  return new Set(cmsTableColumns[table]);
}

export function getUnsupportedCmsPayloadKeys(table: string, payload: JsonRecord) {
  if (!isPlainRecord(payload)) {
    throw new CmsValidationError("CMS payload must be a plain object.");
  }
  const columns = getCmsTableColumnSet(table);
  return Object.keys(payload).filter((key) => !columns.has(key)).sort();
}

export function filterCmsPayloadForTable(table: string, payload: JsonRecord) {
  if (!isPlainRecord(payload)) {
    throw new CmsValidationError("CMS payload must be a plain object.");
  }
  const columns = getCmsTableColumnSet(table);
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => columns.has(key))
  );
}

export function buildCmsDraftPayload(input: CmsDraftInput) {
  assertCmsContentTable(input.table);
  assertActorId(input.actorId);
  const includeAuditFields = input.includeAuditFields ?? true;
  const timestamp = includeAuditFields ? normalizeTimestamp(input.now) : undefined;
  const sortOrder = normalizeSortOrder(input);

  const payload = {
    ...normalizeIdentity(input.identity),
    ...sanitizeFields(input.fields),
    status: "draft" satisfies CmsPublishStatus,
    is_visible: input.isVisible ?? true,
    ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}),
    ...(includeAuditFields
      ? {
          updated_by: input.actorId,
          updated_at: timestamp
        }
      : {})
  };

  return filterCmsPayloadForTable(input.table, payload);
}

export function buildCmsPublishPatch(input: CmsStatePatchInput) {
  assertActorId(input.actorId);
  const payload = {
    status: "published" satisfies CmsPublishStatus,
    is_visible: true,
    updated_by: input.actorId,
    updated_at: normalizeTimestamp(input.now)
  };

  return input.table ? filterCmsPayloadForTable(input.table, payload) : payload;
}

export function buildCmsArchivePatch(input: CmsStatePatchInput) {
  assertActorId(input.actorId);
  const payload = {
    status: "archived" satisfies CmsPublishStatus,
    is_visible: false,
    updated_by: input.actorId,
    updated_at: normalizeTimestamp(input.now)
  };

  return input.table ? filterCmsPayloadForTable(input.table, payload) : payload;
}

export function buildContentRevisionPayload(input: ContentRevisionInput) {
  assertCmsContentTable(input.table);
  assertActorId(input.actorId);
  if (!input.entityId.trim()) {
    throw new CmsValidationError("CMS revision requires an entity id.");
  }
  if (!isPlainRecord(input.snapshot)) {
    throw new CmsValidationError("CMS revision snapshot must be a plain object.");
  }

  return {
    entity_table: input.table,
    entity_id: input.entityId,
    snapshot: input.snapshot,
    change_summary: input.changeSummary ?? null,
    // created_by_user_id is canonical for auth-linked ownership; created_by is legacy actor id on revisions — remove created_by later.
    created_by: input.actorId
  };
}

export function buildContentRevisionRestorePayload(input: ContentRevisionRestoreInput) {
  assertCmsContentTable(input.table);
  assertActorId(input.actorId);
  if (!input.entityId.trim()) {
    throw new CmsValidationError("CMS revision restore requires an entity id.");
  }

  const payload = filterCmsPayloadForTable(input.table, {
    ...sanitizeRestoreSnapshot(input.snapshot),
    updated_by: input.actorId,
    updated_at: normalizeTimestamp(input.now)
  });

  return {
    payload
  };
}

export function diffContentRevisionSnapshots(previous: JsonRecord, next: JsonRecord) {
  if (!isPlainRecord(previous) || !isPlainRecord(next)) {
    throw new CmsValidationError("CMS revision comparisons require plain object snapshots.");
  }

  const ignoredKeys = new Set(["created_at", "created_by", "updated_at", "updated_by", "revision", "entity_table", "entity_id", "status"]);
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);

  return Array.from(keys)
    .filter((key) => !ignoredKeys.has(key))
    .filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]))
    .sort()
    .map((field) => ({
      field,
      previous: previous[field] ?? null,
      next: next[field] ?? null
    }));
}

export async function saveCmsDraft(input: SaveCmsDraftInput, env: EnvSource = process.env) {
  const payload = buildCmsDraftPayload(input);
  return upsertAdminRecord(
    input.table,
    input.conflictColumn ?? getDefaultCmsConflictColumn(input.table),
    payload,
    input.actorId,
    env
  );
}

export async function publishCmsRecord(input: MutateCmsRecordInput, env: EnvSource = process.env) {
  assertCmsContentTable(input.table);
  const payload = buildCmsPublishPatch(input);
  return mutateCmsContentWithRevision({
    operation: "publish",
    table: input.table,
    idColumn: input.idColumn ?? getDefaultCmsConflictColumn(input.table),
    idValue: input.idValue,
    patch: payload,
    actorId: input.actorId,
    changeSummary: input.changeSummary ?? `Publish ${input.table}`,
    requestId: input.requestId ?? null
  }, env);
}

export async function archiveCmsRecord(input: MutateCmsRecordInput, env: EnvSource = process.env) {
  assertCmsContentTable(input.table);
  const payload = buildCmsArchivePatch(input);
  return mutateCmsContentWithRevision({
    operation: "archive",
    table: input.table,
    idColumn: input.idColumn ?? getDefaultCmsConflictColumn(input.table),
    idValue: input.idValue,
    patch: payload,
    actorId: input.actorId,
    changeSummary: input.changeSummary ?? `Archive ${input.table}`,
    requestId: input.requestId ?? null
  }, env);
}

export async function recordCmsRevision(input: ContentRevisionInput, env: EnvSource = process.env) {
  const payload = buildContentRevisionPayload(input);
  return recordEntityRevisionSnapshot(
    payload.entity_table,
    payload.entity_id,
    payload.snapshot,
    input.actorId,
    payload.change_summary,
    env
  );
}

export async function restoreCmsRevision(input: ContentRevisionRestoreInput, env: EnvSource = process.env) {
  assertCmsContentTable(input.table);
  const { payload } = buildContentRevisionRestorePayload(input);
  return mutateCmsContentWithRevision({
    operation: "restore",
    table: input.table,
    idColumn: getDefaultCmsConflictColumn(input.table),
    idValue: input.entityId,
    patch: payload,
    actorId: input.actorId,
    changeSummary: input.changeSummary ?? `Restore ${input.table} content`,
    requestId: input.requestId ?? null
  }, env);
}
