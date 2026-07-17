import { unstable_cache } from "next/cache";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";

const DEFAULT_REVALIDATE_SECONDS = 30;

type CacheOptions = {
  revalidate?: number;
  tags?: string[];
};

function isIncrementalCacheUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("incrementalCache missing");
}

export async function isControlPlaneQueryCachingEnabled() {
  const policy = await getAdminSettingsPolicy();
  return policy.queryCachingEnabled;
}

export async function cacheControlPlaneRead<T>(
  key: string[],
  loader: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const cachingEnabled = await isControlPlaneQueryCachingEnabled();
  if (!cachingEnabled) {
    return loader();
  }

  const revalidate = options.revalidate ?? DEFAULT_REVALIDATE_SECONDS;
  const cached = unstable_cache(loader, key, {
    revalidate,
    tags: options.tags
  });

  try {
    return await cached();
  } catch (error) {
    if (isIncrementalCacheUnavailable(error)) {
      return loader();
    }
    throw error;
  }
}
