import { cache } from "react";
import { emptyHomepageCmsContent, type HomepageCmsContent } from "@/config/homepage-cms";
import {
  defaultHomepageCmsV2Content,
  mergeHomepageCmsV2Content,
  type HomepageCmsV2Content
} from "@/config/homepage-cms-v2";
import { resolveEffectiveHomepageCmsContent } from "@/lib/home/homepage-resolution";
import { getSupabaseAdminConfig } from "@/lib/env";
import { isCmsStrictMode } from "@/lib/cms/strict-mode";
import { getCachedAdminSettingsPayload } from "@/services/admin-settings-cache";

type JsonRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mergeHomepageCmsContent(stored: unknown): HomepageCmsContent {
  return resolveEffectiveHomepageCmsContent(stored);
}

/** Merge draftV1 over published v1 fields for preview. */
export function mergeHomepageV1DraftPreviewFromPayload(payload: unknown): HomepageCmsContent {
  const root = isPlainRecord(payload) ? payload : {};
  const homepage = isPlainRecord(root.homepage) ? root.homepage : {};
  const live = mergeHomepageCmsContent(homepage);
  const draft = isPlainRecord(homepage.draftV1) ? homepage.draftV1 : null;
  if (!draft) return live;
  return mergeHomepageCmsContent({ ...live, ...draft });
}

export function extractHomepageV1LiveFields(content: HomepageCmsContent): HomepageCmsContent {
  return {
    shelves: content.shelves,
    missions: content.missions,
    testimonials: content.testimonials,
    about: content.about
  };
}

export async function fetchHomepageCmsContent(): Promise<HomepageCmsContent> {
  const config = getSupabaseAdminConfig();

  if (!config.configured) {
    if (isCmsStrictMode()) {
      throw new Error("Homepage CMS is unavailable: Supabase is not configured.");
    }
    return mergeHomepageCmsContent({});
  }

  try {
    const row = await getCachedAdminSettingsPayload();
    if (!row?.payload) {
      if (isCmsStrictMode()) {
        throw new Error("Homepage CMS admin_settings row is missing. Save homepage content in the admin editor first.");
      }
      return mergeHomepageCmsContent({});
    }

    const payload = row.payload;
    if (!isPlainRecord(payload) || !isPlainRecord(payload.homepage)) {
      if (isCmsStrictMode()) {
        throw new Error("Homepage CMS payload is empty. Save homepage content in the admin editor first.");
      }
      return mergeHomepageCmsContent({});
    }

    return mergeHomepageCmsContent(payload.homepage);
  } catch (error) {
    if (isCmsStrictMode()) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    return mergeHomepageCmsContent({});
  }
}

export const getHomepageCmsContent = cache(fetchHomepageCmsContent);

export async function fetchHomepageCmsDraftPreviewContent(): Promise<HomepageCmsContent> {
  const config = getSupabaseAdminConfig();

  if (!config.configured) {
    if (isCmsStrictMode()) {
      throw new Error("Homepage CMS is unavailable: Supabase is not configured.");
    }
    return mergeHomepageCmsContent({});
  }

  try {
    const row = await getCachedAdminSettingsPayload();
    if (!row?.payload) {
      return mergeHomepageCmsContent({});
    }
    return mergeHomepageV1DraftPreviewFromPayload(row.payload);
  } catch (error) {
    if (isCmsStrictMode()) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    return mergeHomepageCmsContent({});
  }
}

export const getHomepageCmsDraftPreviewContent = cache(fetchHomepageCmsDraftPreviewContent);

/** Admin editor merge — prefer draftV1 when present so editors see pending changes. */
export async function fetchHomepageCmsEditorContent(): Promise<HomepageCmsContent> {
  return fetchHomepageCmsDraftPreviewContent();
}

export const getHomepageCmsEditorContent = cache(fetchHomepageCmsEditorContent);

/** Admin editor merge — strict empty base when DB field missing (no demo injection). */
export function mergeHomepageCmsContentForAdmin(stored: unknown): HomepageCmsContent {
  const resolved = resolveEffectiveHomepageCmsContent(stored);
  if (!isCmsStrictMode()) return resolved;

  const empty = emptyHomepageCmsContent;
  return {
    shelves: {
      droneWorld: { ...empty.shelves.droneWorld, ...pickDefinedShelf(resolved.shelves.droneWorld) },
      droneCare: { ...empty.shelves.droneCare, ...pickDefinedShelf(resolved.shelves.droneCare) },
      globalProducts: { ...empty.shelves.globalProducts, ...pickDefinedShelf(resolved.shelves.globalProducts) }
    },
    missions: resolved.missions,
    testimonials: resolved.testimonials,
    about: resolved.about
  };
}

function pickDefinedShelf(shelf: HomepageCmsContent["shelves"]["droneWorld"]) {
  const entries = Object.entries(shelf).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number") return value > 0;
    return Boolean(value);
  });
  return Object.fromEntries(entries) as Partial<HomepageCmsContent["shelves"]["droneWorld"]>;
}

export function hasHomepageV1DraftChanges(payload: unknown): boolean {
  const root = isPlainRecord(payload) ? payload : {};
  const homepage = isPlainRecord(root.homepage) ? root.homepage : {};
  if (!isPlainRecord(homepage.draftV1)) return false;
  const live = extractHomepageV1LiveFields(mergeHomepageCmsContent(homepage));
  const draft = extractHomepageV1LiveFields(mergeHomepageCmsContent({ ...homepage, ...homepage.draftV1 }));
  return JSON.stringify(live) !== JSON.stringify(draft);
}

export type UnifiedHomepageCms = {
  v1: HomepageCmsContent;
  v2: HomepageCmsV2Content;
};

export function mergeUnifiedHomepagePublished(payload: unknown): UnifiedHomepageCms {
  const root = isPlainRecord(payload) ? payload : {};
  const homepage = isPlainRecord(root.homepage) ? root.homepage : {};
  const v2 = isPlainRecord(homepage.v2) ? homepage.v2 : {};
  return {
    v1: mergeHomepageCmsContent(homepage),
    v2: mergeHomepageCmsV2Content(v2)
  };
}

export function mergeUnifiedHomepageDraftPreview(payload: unknown): UnifiedHomepageCms {
  const root = isPlainRecord(payload) ? payload : {};
  const homepage = isPlainRecord(root.homepage) ? root.homepage : {};
  const v2 = isPlainRecord(homepage.v2) ? homepage.v2 : {};
  const draftV2 = isPlainRecord(homepage.draftV2) ? homepage.draftV2 : null;
  const liveV2 = mergeHomepageCmsV2Content(v2);
  return {
    v1: mergeHomepageV1DraftPreviewFromPayload(payload),
    v2: draftV2 ? mergeHomepageCmsV2Content({ ...liveV2, ...draftV2 }) : liveV2
  };
}

export { defaultHomepageCmsV2Content, mergeHomepageCmsV2Content };
