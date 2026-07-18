import { cache } from "react";
import { getSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export type CachedAdminSettingsRow = {
  payload?: unknown;
  updated_at?: string;
};

export const getCachedAdminSettingsPayload = cache(async (): Promise<CachedAdminSettingsRow | null> => {
  const config = getSupabaseAdminConfig();
  if (!config.configured) return null;

  const response = await fetchWithTimeout(`${config.url}/rest/v1/admin_settings?id=eq.global&select=payload,updated_at&limit=1`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`
    },
    next: {
      revalidate: 60,
      tags: ["cms", "admin-settings", "homepage-cms", "homepage-cms-v2", "cms-footer-lead"]
    }
  });

  if (!response.ok || response.status === 404) return null;
  const rows = (await response.json()) as CachedAdminSettingsRow[];
  return rows[0] ?? null;
});
