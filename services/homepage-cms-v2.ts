import { cache } from "react";
import {
  defaultHomepageCmsV2Content,
  mergeHomepageCmsV2Content,
  type HomepageCmsV2Content
} from "@/config/homepage-cms-v2";
import { isCmsStrictMode } from "@/lib/cms/strict-mode";
import { getSupabaseAdminConfig } from "@/lib/env";
import { getCachedAdminSettingsPayload } from "@/services/admin-settings-cache";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mergeHomepageV2PublishedFromPayload(payload: unknown): HomepageCmsV2Content {
  const root = isPlainRecord(payload) ? payload : {};
  const homepage = isPlainRecord(root.homepage) ? root.homepage : {};
  const v2 = isPlainRecord(homepage.v2) ? homepage.v2 : {};
  return mergeHomepageCmsV2Content(v2);
}

export function mergeHomepageV2DraftPreviewFromPayload(payload: unknown): HomepageCmsV2Content {
  const root = isPlainRecord(payload) ? payload : {};
  const homepage = isPlainRecord(root.homepage) ? root.homepage : {};
  const v2 = isPlainRecord(homepage.v2) ? homepage.v2 : {};
  const draft = isPlainRecord(homepage.draftV2) ? homepage.draftV2 : null;
  const live = mergeHomepageCmsV2Content(v2);
  if (!draft) return live;
  return mergeHomepageCmsV2Content({ ...live, ...draft });
}

/** @deprecated Use mergeHomepageV2PublishedFromPayload or mergeHomepageV2DraftPreviewFromPayload */
function mergeHomepageV2FromPayload(payload: unknown): HomepageCmsV2Content {
  return mergeHomepageV2PublishedFromPayload(payload);
}

async function fetchAdminSettingsPayload(): Promise<unknown> {
  const row = await getCachedAdminSettingsPayload();
  return row?.payload ?? null;
}

export async function fetchHomepageCmsV2Content(): Promise<HomepageCmsV2Content> {
  const fallback = defaultHomepageCmsV2Content;
  const config = getSupabaseAdminConfig();

  if (!config.configured) {
    if (isCmsStrictMode()) {
      throw new Error("Homepage CMS v2 is unavailable: Supabase is not configured.");
    }
    return fallback;
  }

  try {
    const payload = await fetchAdminSettingsPayload();
    if (!payload) return fallback;
    return mergeHomepageV2PublishedFromPayload(payload);
  } catch (error) {
    if (isCmsStrictMode()) throw error instanceof Error ? error : new Error(String(error));
    return fallback;
  }
}

export async function fetchHomepageCmsV2DraftPreviewContent(): Promise<HomepageCmsV2Content> {
  const fallback = defaultHomepageCmsV2Content;
  const config = getSupabaseAdminConfig();

  if (!config.configured) {
    if (isCmsStrictMode()) {
      throw new Error("Homepage CMS v2 is unavailable: Supabase is not configured.");
    }
    return fallback;
  }

  try {
    const payload = await fetchAdminSettingsPayload();
    if (!payload) return fallback;
    return mergeHomepageV2DraftPreviewFromPayload(payload);
  } catch (error) {
    if (isCmsStrictMode()) throw error instanceof Error ? error : new Error(String(error));
    return fallback;
  }
}

export const getHomepageCmsV2Content = cache(fetchHomepageCmsV2Content);
export const getHomepageCmsV2DraftPreviewContent = cache(fetchHomepageCmsV2DraftPreviewContent);
