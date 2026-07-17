import { cache } from "react";
import {
  contentSourcesForComponent,
  defaultHomepageContentSources,
  type CmsDomainContentSource
} from "@/config/cms-resolver-registry";
import { isCmsStrictMode } from "@/lib/cms/strict-mode";
import { getSupabaseAdminConfig } from "@/lib/env";

/** Always loaded on `/` because `app/page.tsx` renders HomeLandingComposite unconditionally. */
const HOMEPAGE_PINNED_SOURCES: CmsDomainContentSource[] = ["admin_settings"];

export type CmsOrchestrationRow = Record<string, unknown>;

export type CmsPageOrchestration = {
  routePath: string;
  page: CmsOrchestrationRow | null;
  sections: CmsOrchestrationRow[];
  contentSources: CmsDomainContentSource[];
  resolverStatus: "orchestrated" | "default";
};

type EnvSource = Record<string, string | undefined>;

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function publishedSection(row: CmsOrchestrationRow) {
  const status = optionalString(row.status) || "published";
  return status === "published" && row.is_visible !== false;
}

const cmsFetchAttempts = 3;
const CMS_FETCH_TIMEOUT_MS = 30_000;

function isRetryableCmsStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAdminRows(table: string, query: string, env: EnvSource = process.env) {
  const config = getSupabaseAdminConfig(env);
  if (!config.configured) return null;

  // Validate URL format to catch malformed URLs early
  new URL(`${config.url}/rest/v1/${table}?${query}`);

  let lastError: unknown;
  for (let attempt = 1; attempt <= cmsFetchAttempts; attempt += 1) {
    try {
      const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`
        },
        next: { revalidate: 60, tags: ["cms-orchestration", `cms-${table}`] },
        signal: AbortSignal.timeout(CMS_FETCH_TIMEOUT_MS)
      });

      if (!response.ok) {
        const error = new Error(`Supabase API returned ${response.status} for table ${table}`);
        if (attempt < cmsFetchAttempts && isRetryableCmsStatus(response.status)) {
          lastError = error;
          await wait(250 * attempt * attempt);
          continue;
        }
        if (isCmsStrictMode(env)) {
          throw error;
        }
        return null;
      }
      return (await response.json()) as CmsOrchestrationRow[];
    } catch (error) {
      lastError = error;
      if (attempt >= cmsFetchAttempts) break;
      await wait(250 * attempt * attempt);
    }
  }

  if (isCmsStrictMode(env)) {
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Failed to fetch CMS data from ${table} after ${cmsFetchAttempts} attempts: ${message}`);
  }
  return null;
}

function resolveContentSources(sections: CmsOrchestrationRow[]): CmsDomainContentSource[] {
  const active = sections.filter(publishedSection);
  const set = new Set<CmsDomainContentSource>();
  for (const section of active) {
    for (const source of contentSourcesForComponent(optionalString(section.component_key))) {
      set.add(source);
    }
  }
  if (!set.size) return defaultHomepageContentSources();
  return Array.from(set);
}

function pinHomepageSources(routePath: string, sources: CmsDomainContentSource[]) {
  if (routePath !== "/") return sources;
  const set = new Set(sources);
  for (const source of HOMEPAGE_PINNED_SOURCES) set.add(source);
  return Array.from(set);
}

export async function resolveCmsPageOrchestration(
  routePath: string,
  env: EnvSource = process.env
): Promise<CmsPageOrchestration> {
  const normalizedRoute = routePath.startsWith("/") ? routePath : `/${routePath}`;
  const [pages, allSections] = await Promise.all([
    fetchAdminRows(
      "cms_pages",
      `select=id,slug,title,route_path,sort_order,is_visible,status&route_path=eq.${encodeURIComponent(normalizedRoute)}&limit=1`,
      env
    ),
    fetchAdminRows(
      "cms_sections",
      "select=id,page_id,section_key,component_key,title,sort_order,is_visible,status&order=sort_order.asc&limit=80",
      env
    )
  ]);

  const page = pages?.[0] ?? null;
  const pageId = optionalString(page?.id);
  const sections = (allSections ?? [])
    .filter((row) => !pageId || optionalString(row.page_id) === pageId)
    .filter(publishedSection);

  const contentSources = pinHomepageSources(normalizedRoute, resolveContentSources(sections));

  return {
    routePath: normalizedRoute,
    page,
    sections,
    contentSources,
    resolverStatus: page && sections.length ? "orchestrated" : "default"
  };
}

export const getHomepageCmsOrchestration = cache(async () => resolveCmsPageOrchestration("/"));

export function shouldLoadCmsSource(
  orchestration: CmsPageOrchestration,
  source: CmsDomainContentSource
) {
  return orchestration.contentSources.includes(source);
}
