import {
  deleteCachedKeys,
  invalidateControlPlaneRedisCaches,
  invalidateRedisKeyPattern,
  REDIS_CACHE_KEYS
} from "@/lib/cache-redis";

export async function invalidateCatalogRedisCaches(productSlug?: string) {
  const keys: string[] = [
    REDIS_CACHE_KEYS.catalogSearchIndex,
    REDIS_CACHE_KEYS.catalogShowroom,
    REDIS_CACHE_KEYS.cmsShell,
    REDIS_CACHE_KEYS.cmsHomepage
  ];
  if (productSlug) keys.push(REDIS_CACHE_KEYS.productCore(productSlug));
  await Promise.all([
    deleteCachedKeys(keys),
    invalidateRedisKeyPattern("catalog:category:"),
    invalidateRedisKeyPattern("catalog:media:")
  ]);
}

export async function invalidateCmsRedisCaches() {
  await deleteCachedKeys([REDIS_CACHE_KEYS.cmsHomepage, REDIS_CACHE_KEYS.cmsShell]);
}

export async function invalidateNavMetricsRedisCaches() {
  await invalidateControlPlaneRedisCaches({ navMetrics: true });
}

export async function invalidateAuthRoleRedisCaches(userId?: string) {
  if (userId) {
    await invalidateRedisKeyPattern(REDIS_CACHE_KEYS.authRoleContextPrefix(userId));
    return;
  }
  await invalidateRedisKeyPattern("auth:role:");
}
