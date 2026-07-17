import { cache } from "react";
import { readThroughCache, REDIS_CACHE_KEYS } from "@/lib/cache-redis";
import { getEnterpriseMenuProducts, type EnterpriseMenuLoadResult } from "@/services/catalog";
import { getStorefrontShellCms, type StorefrontShellCms } from "@/services/cms";

export type StorefrontShellBundle = {
  cms: StorefrontShellCms;
  enterpriseMenu: EnterpriseMenuLoadResult;
};

async function loadStorefrontShellBundleUncached(): Promise<StorefrontShellBundle> {
  const [enterpriseMenu, cms] = await Promise.all([
    getEnterpriseMenuProducts(),
    getStorefrontShellCms()
  ]);
  return { cms, enterpriseMenu };
}

export const getStorefrontShellBundle = cache(async (): Promise<StorefrontShellBundle> => {
  return readThroughCache(REDIS_CACHE_KEYS.cmsShell, 60, loadStorefrontShellBundleUncached);
});
