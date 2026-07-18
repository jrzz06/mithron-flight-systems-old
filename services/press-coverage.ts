import { defaultPressCoverageItems } from "@/config/press-coverage-defaults";
import { assertValidExternalUrl } from "@/lib/press/validate-external-url";
import { assertSupabaseAdminConfig } from "@/lib/env";
import type {
  PressCoverageInput,
  PressCoverageItem,
  PressCoverImage,
  PressPublishStatus
} from "@/lib/press/press-coverage-shared";
import {
  createAdminRecord,
  deleteAdminRecord,
  fetchAdminRecordsByColumn,
  updateAdminRecord
} from "@/services/admin-actions";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type EnvSource = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

export type {
  PressCoverageInput,
  PressCoverageItem,
  PressCoverImage,
  PressPublishStatus
} from "@/lib/press/press-coverage-shared";
export { pressCtaLabel } from "@/lib/press/press-coverage-shared";

const PRESS_SELECT =
  "id,publisher,title,description,cover_image,external_url,sort_order,is_featured,status,is_visible,published_at,archived_at,created_at,updated_at";

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function parseCoverImage(value: unknown): PressCoverImage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { url: "", alt: "" };
  }
  const record = value as JsonRecord;
  return {
    url: text(record.url),
    alt: text(record.alt),
    mediaAssetId: text(record.mediaAssetId) || text(record.media_asset_id) || null
  };
}

function mapPressCoverage(row: JsonRecord): PressCoverageItem {
  const statusRaw = text(row.status, "draft");
  const status: PressPublishStatus =
    statusRaw === "published" || statusRaw === "archived" ? statusRaw : "draft";

  return {
    id: text(row.id),
    publisher: text(row.publisher),
    title: text(row.title),
    description: text(row.description),
    cover_image: parseCoverImage(row.cover_image),
    external_url: text(row.external_url),
    sort_order: Number(row.sort_order) || 100,
    is_featured: row.is_featured === true,
    status,
    is_visible: row.is_visible !== false,
    published_at: typeof row.published_at === "string" ? row.published_at : null,
    archived_at: typeof row.archived_at === "string" ? row.archived_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined
  };
}

async function fetchPressRows(
  query: string,
  env: EnvSource = process.env,
  options: { cache?: RequestCache; tags?: string[]; allowMissing?: boolean } = {}
): Promise<JsonRecord[]> {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(`${config.url}/rest/v1/press_coverage?${query}`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`
    },
    cache: options.cache ?? "no-store",
    ...(options.tags?.length ? { next: { tags: options.tags, revalidate: 60 } } : {})
  });
  if (!response.ok) {
    if (options.allowMissing && response.status === 404) {
      return [];
    }
    throw new Error(`Failed to load press coverage (${response.status}).`);
  }
  const rows = (await response.json()) as JsonRecord[];
  return Array.isArray(rows) ? rows : [];
}

async function fetchPressRowsPublic(
  query: string,
  env: EnvSource = process.env,
  options: { cache?: RequestCache; tags?: string[] } = {}
): Promise<JsonRecord[]> {
  try {
    return await fetchPressRows(query, env, { ...options, allowMissing: true });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[press] Failed to fetch public press rows.", error);
    }
    return [];
  }
}

function buildPayload(input: PressCoverageInput, actorId: string | null, existing?: PressCoverageItem | null) {
  const publisher = text(input.publisher ?? existing?.publisher ?? "");
  const title = text(input.title ?? existing?.title ?? "");
  const description = text(input.description ?? existing?.description ?? "").slice(0, 600);
  const externalUrl = assertValidExternalUrl(text(input.externalUrl ?? existing?.external_url ?? ""));
  const status = input.status ?? existing?.status ?? "draft";
  const cover = input.coverImage ?? existing?.cover_image ?? { url: "", alt: "" };
  const publishedAt =
    status === "published"
      ? text(existing?.published_at ?? "") || new Date().toISOString()
      : existing?.published_at ?? null;

  if (!publisher) throw new Error("Publisher is required.");
  if (!title) throw new Error("Article title is required.");

  return {
    publisher: publisher.slice(0, 120),
    title: title.slice(0, 200),
    description,
    cover_image: {
      url: text(cover.url).slice(0, 1000),
      alt: text(cover.alt).slice(0, 200),
      ...(cover.mediaAssetId ? { mediaAssetId: cover.mediaAssetId } : {})
    },
    external_url: externalUrl,
    sort_order:
      typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
        ? Math.trunc(input.sortOrder)
        : existing?.sort_order ?? 100,
    is_featured: Boolean(input.isFeatured ?? existing?.is_featured),
    status,
    is_visible: true,
    published_at: publishedAt,
    archived_at: status === "archived" ? existing?.archived_at ?? new Date().toISOString() : null,
    updated_by: actorId,
    updated_at: new Date().toISOString()
  };
}

export async function listAdminPressCoverage(
  options: { status?: string; q?: string } = {},
  env: EnvSource = process.env
) {
  const rows = await fetchPressRows(`select=${PRESS_SELECT}&order=sort_order.asc,updated_at.desc&limit=200`, env);
  let items = rows.map(mapPressCoverage);
  if (options.status && options.status !== "all") {
    items = items.filter((item) => item.status === options.status);
  }
  const query = text(options.q).toLowerCase();
  if (query) {
    items = items.filter((item) => {
      const haystack = `${item.publisher} ${item.title} ${item.description} ${item.external_url}`.toLowerCase();
      return haystack.includes(query);
    });
  }
  return items;
}

export async function getPressCoverageById(id: string, env: EnvSource = process.env) {
  const rows = await fetchAdminRecordsByColumn("press_coverage", "id", id, env);
  const row = rows[0];
  return row ? mapPressCoverage(row) : null;
}

export async function listPublishedPressCoverage(
  options: { limit?: number; featuredOnly?: boolean } = {},
  env: EnvSource = process.env
) {
  const limit = Math.max(1, Math.min(12, options.limit ?? 3));
  const rows = await fetchPressRowsPublic(
    [
      `select=${PRESS_SELECT}`,
      "status=eq.published",
      "is_visible=eq.true",
      "archived_at=is.null",
      ...(options.featuredOnly ? ["is_featured=eq.true"] : []),
      "order=sort_order.asc,published_at.desc.nullslast",
      `limit=${limit}`
    ].join("&"),
    env,
    { cache: "force-cache", tags: ["press"] }
  );

  if (!rows.length) {
    return defaultPressCoverageItems.slice(0, limit);
  }

  return rows.map(mapPressCoverage);
}

export async function createPressCoverage(
  input: PressCoverageInput,
  actorId: string | null,
  env: EnvSource = process.env
) {
  const payload = buildPayload(input, actorId);
  const record = await createAdminRecord(
    "press_coverage",
    {
      ...payload,
      created_by: actorId,
      created_at: new Date().toISOString()
    },
    actorId,
    env
  );
  return mapPressCoverage(record as JsonRecord);
}

export async function updatePressCoverage(
  id: string,
  input: PressCoverageInput,
  actorId: string | null,
  env: EnvSource = process.env
) {
  const existing = await getPressCoverageById(id, env);
  if (!existing) throw new Error("Press coverage item not found.");
  const payload = buildPayload(input, actorId, existing);
  const record = await updateAdminRecord("press_coverage", "id", id, payload, actorId, env);
  return mapPressCoverage((record as JsonRecord) ?? { ...existing, ...payload });
}

export async function publishPressCoverage(id: string, actorId: string | null, env: EnvSource = process.env) {
  return updatePressCoverage(id, { status: "published" }, actorId, env);
}

export async function unpublishPressCoverage(id: string, actorId: string | null, env: EnvSource = process.env) {
  return updatePressCoverage(id, { status: "draft" }, actorId, env);
}

export async function archivePressCoverage(id: string, actorId: string | null, env: EnvSource = process.env) {
  return updatePressCoverage(id, { status: "archived" }, actorId, env);
}

export async function deletePressCoverage(id: string, actorId: string | null, env: EnvSource = process.env) {
  await deleteAdminRecord("press_coverage", "id", id, actorId, env);
}

export async function reorderPressCoverage(
  orderedIds: string[],
  actorId: string | null,
  env: EnvSource = process.env
) {
  const uniqueIds = [...new Set(orderedIds.filter(Boolean))];
  await Promise.all(
    uniqueIds.map((id, index) =>
      updateAdminRecord(
        "press_coverage",
        "id",
        id,
        {
          sort_order: (index + 1) * 10,
          updated_by: actorId,
          updated_at: new Date().toISOString()
        },
        actorId,
        env
      )
    )
  );
}
