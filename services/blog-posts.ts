import { cache } from "react";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { slugifyProductValue } from "@/lib/supplier/product-form";
import {
  createAdminRecord,
  deleteAdminRecord,
  fetchAdminRecordsByColumn,
  updateAdminRecord
} from "@/services/admin-actions";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type EnvSource = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

export type BlogPublishStatus = "draft" | "published" | "archived";

export type BlogCoverImage = {
  url: string;
  alt?: string;
  mediaAssetId?: string | null;
};

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  body_json: JsonRecord | null;
  cover_image: BlogCoverImage;
  category: string;
  tags: string[];
  author: string;
  reading_time_minutes: number;
  is_featured: boolean;
  published_at: string | null;
  seo_title: string | null;
  meta_description: string | null;
  related_product_slugs: string[];
  status: BlogPublishStatus;
  is_visible: boolean;
  revision: number;
  archived_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type BlogPostInput = {
  title: string;
  slug?: string | null;
  excerpt?: string | null;
  body?: string | null;
  bodyJson?: JsonRecord | null;
  coverImage?: BlogCoverImage | null;
  category?: string | null;
  tags?: string[] | null;
  author?: string | null;
  readingTimeMinutes?: number | null;
  isFeatured?: boolean;
  publishedAt?: string | null;
  seoTitle?: string | null;
  metaDescription?: string | null;
  relatedProductSlugs?: string[] | null;
  status?: BlogPublishStatus;
};

const BLOG_SELECT =
  "id,slug,title,excerpt,body,body_json,cover_image,category,tags,author,reading_time_minutes,is_featured,published_at,seo_title,meta_description,related_product_slugs,status,is_visible,revision,archived_at,created_at,updated_at";

/** List/teaser rows — omits heavy body fields used only on article pages. */
const BLOG_LIST_SELECT =
  "id,slug,title,excerpt,cover_image,category,tags,author,reading_time_minutes,is_featured,published_at,seo_title,meta_description,related_product_slugs,status,is_visible,revision,archived_at,created_at,updated_at";

const BLOG_TEASER_SELECT = BLOG_LIST_SELECT;

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function parseCoverImage(value: unknown): BlogCoverImage {
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

export function normalizeBlogSlug(value: string, titleFallback = "") {
  const fromValue = slugifyProductValue(value);
  if (fromValue) return fromValue;
  const fromTitle = slugifyProductValue(titleFallback);
  if (fromTitle) return fromTitle;
  return `article-${Date.now().toString(36)}`;
}

export function estimateReadingTimeMinutes(htmlOrText: string) {
  const plain = htmlOrText
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = plain ? plain.split(" ").length : 0;
  return Math.max(1, Math.min(120, Math.ceil(words / 200) || 1));
}

function mapBlogPost(row: JsonRecord): BlogPost {
  const statusRaw = text(row.status, "draft");
  const status: BlogPublishStatus =
    statusRaw === "published" || statusRaw === "archived" ? statusRaw : "draft";

  return {
    id: text(row.id),
    slug: text(row.slug),
    title: text(row.title),
    excerpt: text(row.excerpt),
    body: text(row.body),
    body_json:
      row.body_json && typeof row.body_json === "object" && !Array.isArray(row.body_json)
        ? (row.body_json as JsonRecord)
        : null,
    cover_image: parseCoverImage(row.cover_image),
    category: text(row.category),
    tags: asStringArray(row.tags),
    author: text(row.author, "Mithron"),
    reading_time_minutes: Math.max(1, Number(row.reading_time_minutes) || 1),
    is_featured: row.is_featured === true,
    published_at: typeof row.published_at === "string" ? row.published_at : null,
    seo_title: text(row.seo_title) || null,
    meta_description: text(row.meta_description) || null,
    related_product_slugs: asStringArray(row.related_product_slugs),
    status,
    is_visible: row.is_visible !== false,
    revision: Number(row.revision) || 1,
    archived_at: typeof row.archived_at === "string" ? row.archived_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined
  };
}

async function fetchBlogRows(
  query: string,
  env: EnvSource = process.env,
  options: { cache?: RequestCache; tags?: string[]; allowMissing?: boolean } = {}
): Promise<JsonRecord[]> {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(`${config.url}/rest/v1/blog_posts?${query}`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`
    },
    cache: options.cache ?? "no-store",
    ...(options.tags?.length
      ? { next: { tags: options.tags, revalidate: 60 } }
      : {})
  });
  if (!response.ok) {
    if (options.allowMissing && response.status === 404) {
      return [];
    }
    throw new Error(`Failed to load blog posts (${response.status}).`);
  }
  const rows = (await response.json()) as JsonRecord[];
  return Array.isArray(rows) ? rows : [];
}

async function fetchBlogRowsPublic(
  query: string,
  env: EnvSource = process.env,
  options: { cache?: RequestCache; tags?: string[] } = {}
): Promise<JsonRecord[]> {
  try {
    return await fetchBlogRows(query, env, { ...options, allowMissing: true });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[blog] Failed to fetch public blog rows.", error);
    }
    return [];
  }
}

function buildPayload(input: BlogPostInput, actorId: string | null, existing?: BlogPost | null) {
  const title = text(input.title);
  if (!title) throw new Error("Title is required.");

  const slug = normalizeBlogSlug(text(input.slug ?? ""), title);
  const body = text(input.body ?? existing?.body ?? "");
  const excerpt = text(input.excerpt ?? existing?.excerpt ?? "").slice(0, 600);
  const readingTime =
    typeof input.readingTimeMinutes === "number" && Number.isFinite(input.readingTimeMinutes)
      ? Math.max(1, Math.min(120, Math.trunc(input.readingTimeMinutes)))
      : existing?.reading_time_minutes ?? estimateReadingTimeMinutes(body);

  const status = input.status ?? existing?.status ?? "draft";
  const cover = input.coverImage ?? existing?.cover_image ?? { url: "", alt: "" };
  const publishedAt =
    status === "published"
      ? text(input.publishedAt ?? existing?.published_at ?? "") || new Date().toISOString()
      : input.publishedAt === null
        ? null
        : text(input.publishedAt ?? "") || existing?.published_at || null;

  return {
    slug,
    title: title.slice(0, 200),
    excerpt,
    body,
    body_json: input.bodyJson ?? existing?.body_json ?? null,
    cover_image: {
      url: text(cover.url).slice(0, 1000),
      alt: text(cover.alt).slice(0, 200),
      ...(cover.mediaAssetId ? { mediaAssetId: cover.mediaAssetId } : {})
    },
    category: text(input.category ?? existing?.category ?? "").slice(0, 80),
    tags: (input.tags ?? existing?.tags ?? []).map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
    author: text(input.author ?? existing?.author ?? "Mithron").slice(0, 120) || "Mithron",
    reading_time_minutes: readingTime,
    is_featured: Boolean(input.isFeatured ?? existing?.is_featured),
    published_at: publishedAt,
    seo_title: text(input.seoTitle ?? existing?.seo_title ?? "").slice(0, 160) || null,
    meta_description: text(input.metaDescription ?? existing?.meta_description ?? "").slice(0, 320) || null,
    related_product_slugs: (input.relatedProductSlugs ?? existing?.related_product_slugs ?? [])
      .map((slugValue) => slugifyProductValue(slugValue))
      .filter(Boolean)
      .slice(0, 24),
    status,
    is_visible: true,
    archived_at: status === "archived" ? existing?.archived_at ?? new Date().toISOString() : null,
    updated_by: actorId,
    updated_at: new Date().toISOString()
  };
}

export async function listAdminBlogPosts(
  options: { status?: string; q?: string } = {},
  env: EnvSource = process.env
) {
  const status = options.status ?? "all";
  const q = text(options.q).trim();
  const { readThroughCache, REDIS_CACHE_KEYS } = await import("@/lib/cache-redis");
  const { cacheControlPlaneRead } = await import("@/lib/control-plane/query-cache");

  return readThroughCache(
    REDIS_CACHE_KEYS.controlPlaneAdminBlogPosts(status, q),
    30,
    () =>
      cacheControlPlaneRead(
        ["admin-blog-posts", status, q],
        () => resolveAdminBlogPosts(options, env),
        { revalidate: 30, tags: ["admin-blog", "control-plane-blog"] }
      )
  );
}

async function resolveAdminBlogPosts(
  options: { status?: string; q?: string } = {},
  env: EnvSource = process.env
) {
  const params = [`select=${BLOG_SELECT}`, "order=updated_at.desc", "limit=200"];
  if (options.status && options.status !== "all") {
    params.push(`status=eq.${encodeURIComponent(options.status)}`);
  }

  const query = text(options.q).trim();
  if (query) {
    const pattern = encodeURIComponent(`*${query}*`);
    params.push(`or=(title.ilike.${pattern},slug.ilike.${pattern},excerpt.ilike.${pattern},category.ilike.${pattern},author.ilike.${pattern})`);
  }

  const rows = await fetchBlogRows(params.join("&"), env);
  return rows.map(mapBlogPost);
}

export async function getBlogPostById(id: string, env: EnvSource = process.env) {
  const rows = await fetchAdminRecordsByColumn("blog_posts", "id", id, env);
  const row = rows[0];
  return row ? mapBlogPost(row) : null;
}

export const getBlogPostBySlug = cache(async (slug: string, env: EnvSource = process.env) => {
  const normalized = normalizeBlogSlug(slug);
  const rows = await fetchBlogRows(
    `select=${BLOG_SELECT}&slug=eq.${encodeURIComponent(normalized)}&limit=1`,
    env,
    { cache: "force-cache", tags: ["blog", `blog:${normalized}`] }
  );
  const row = rows[0];
  return row ? mapBlogPost(row) : null;
});

export async function listPublishedBlogPosts(
  options: { limit?: number } = {},
  env: EnvSource = process.env
) {
  const limit = Math.max(1, Math.min(48, options.limit ?? 12));
  const now = new Date().toISOString();
  const rows = await fetchBlogRowsPublic(
    [
      `select=${BLOG_TEASER_SELECT}`,
      "status=eq.published",
      "is_visible=eq.true",
      "archived_at=is.null",
      `or=(published_at.is.null,published_at.lte.${encodeURIComponent(now)})`,
      "order=published_at.desc.nullslast",
      `limit=${limit}`
    ].join("&"),
    env,
    { cache: "force-cache", tags: ["blog"] }
  );
  return rows.map(mapBlogPost);
}

export async function listScheduledBlogPostsReadyToPublish(
  options: { limit?: number } = {},
  env: EnvSource = process.env
) {
  const limit = Math.max(1, Math.min(100, options.limit ?? 50));
  const now = new Date().toISOString();
  const rows = await fetchBlogRows(
    [
      `select=${BLOG_SELECT}`,
      "status=eq.draft",
      "archived_at=is.null",
      `published_at=lte.${encodeURIComponent(now)}`,
      "published_at=not.is.null",
      "order=published_at.asc",
      `limit=${limit}`
    ].join("&"),
    env
  );
  return rows.map(mapBlogPost);
}

export async function publishDueScheduledBlogPosts(actorId: string | null = null, env: EnvSource = process.env) {
  const due = await listScheduledBlogPostsReadyToPublish({ limit: 50 }, env);
  const published: string[] = [];
  for (const post of due) {
    await publishBlogPost(post.id, actorId, env);
    published.push(post.id);
  }
  return { publishedCount: published.length, ids: published };
}

export async function createBlogPost(
  input: BlogPostInput,
  actorId: string | null,
  env: EnvSource = process.env
) {
  const payload = buildPayload(input, actorId);
  const record = await createAdminRecord(
    "blog_posts",
    {
      ...payload,
      created_by: actorId,
      created_at: new Date().toISOString(),
      revision: 1
    },
    actorId,
    env
  );
  return mapBlogPost(record as JsonRecord);
}

export async function updateBlogPost(
  id: string,
  input: BlogPostInput,
  actorId: string | null,
  env: EnvSource = process.env,
  options: { expectedUpdatedAt?: string | null } = {}
) {
  const existing = await getBlogPostById(id, env);
  if (!existing) throw new Error("Blog post not found.");
  const payload = buildPayload(input, actorId, existing);
  const record = await updateAdminRecord(
    "blog_posts",
    "id",
    id,
    {
      ...payload,
      revision: existing.revision + 1
    },
    actorId,
    env,
    { expectedUpdatedAt: options.expectedUpdatedAt ?? existing.updated_at ?? null }
  );
  return mapBlogPost((record as JsonRecord) ?? { ...existing, ...payload });
}

export async function publishBlogPost(id: string, actorId: string | null, env: EnvSource = process.env) {
  const existing = await getBlogPostById(id, env);
  if (!existing) throw new Error("Blog post not found.");
  return updateBlogPost(
    id,
    {
      title: existing.title,
      slug: existing.slug,
      excerpt: existing.excerpt,
      body: existing.body,
      bodyJson: existing.body_json,
      coverImage: existing.cover_image,
      category: existing.category,
      tags: existing.tags,
      author: existing.author,
      readingTimeMinutes: existing.reading_time_minutes,
      isFeatured: existing.is_featured,
      publishedAt: existing.published_at ?? new Date().toISOString(),
      seoTitle: existing.seo_title,
      metaDescription: existing.meta_description,
      relatedProductSlugs: existing.related_product_slugs,
      status: "published"
    },
    actorId,
    env
  );
}

export async function unpublishBlogPost(id: string, actorId: string | null, env: EnvSource = process.env) {
  const existing = await getBlogPostById(id, env);
  if (!existing) throw new Error("Blog post not found.");
  return updateBlogPost(
    id,
    {
      title: existing.title,
      slug: existing.slug,
      excerpt: existing.excerpt,
      body: existing.body,
      bodyJson: existing.body_json,
      coverImage: existing.cover_image,
      category: existing.category,
      tags: existing.tags,
      author: existing.author,
      readingTimeMinutes: existing.reading_time_minutes,
      isFeatured: existing.is_featured,
      publishedAt: existing.published_at,
      seoTitle: existing.seo_title,
      metaDescription: existing.meta_description,
      relatedProductSlugs: existing.related_product_slugs,
      status: "draft"
    },
    actorId,
    env
  );
}

export async function archiveBlogPost(id: string, actorId: string | null, env: EnvSource = process.env) {
  const existing = await getBlogPostById(id, env);
  if (!existing) throw new Error("Blog post not found.");
  return updateBlogPost(
    id,
    {
      title: existing.title,
      slug: existing.slug,
      excerpt: existing.excerpt,
      body: existing.body,
      bodyJson: existing.body_json,
      coverImage: existing.cover_image,
      category: existing.category,
      tags: existing.tags,
      author: existing.author,
      readingTimeMinutes: existing.reading_time_minutes,
      isFeatured: existing.is_featured,
      publishedAt: existing.published_at,
      seoTitle: existing.seo_title,
      metaDescription: existing.meta_description,
      relatedProductSlugs: existing.related_product_slugs,
      status: "archived"
    },
    actorId,
    env
  );
}

export async function deleteBlogPost(id: string, actorId: string | null, env: EnvSource = process.env) {
  await deleteAdminRecord("blog_posts", "id", id, actorId, env);
}
