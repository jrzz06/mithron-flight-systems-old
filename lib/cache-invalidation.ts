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
    REDIS_CACHE_KEYS.catalogCartSuggestions,
    REDIS_CACHE_KEYS.categoryOptions,
    REDIS_CACHE_KEYS.cmsShell,
    REDIS_CACHE_KEYS.cmsHomepage,
    REDIS_CACHE_KEYS.cmsHero
  ];
  if (productSlug) {
    keys.push(
      REDIS_CACHE_KEYS.productCore(productSlug),
      REDIS_CACHE_KEYS.catalogProductRow(productSlug),
      REDIS_CACHE_KEYS.productPage(productSlug)
    );
  }
  await Promise.all([
    deleteCachedKeys(keys),
    invalidateRedisKeyPattern("catalog:category:"),
    invalidateRedisKeyPattern("catalog:media:"),
    invalidateRedisKeyPattern("catalog:search-q:"),
    invalidateRedisKeyPattern("catalog:cart-pricing:"),
    // Realtime/catalog writes often omit the slug; always bust PDP cores so price/stock
    // cannot linger for the full product:core TTL after an inventory or product change.
    productSlug
      ? Promise.resolve()
      : Promise.all([
          invalidateRedisKeyPattern("product:core:"),
          invalidateRedisKeyPattern("catalog:product-row:"),
          invalidateRedisKeyPattern("product:page:")
        ]).then(() => undefined),
    // Reviews + related shells are customer PDP caches; clear with catalog writes.
    productSlug
      ? Promise.all([
          invalidateRedisKeyPattern(`product:reviews:${productSlug}:`),
          invalidateRedisKeyPattern(`product:related:${productSlug}:`)
        ]).then(() => undefined)
      : Promise.all([
          invalidateRedisKeyPattern("product:reviews:"),
          invalidateRedisKeyPattern("product:related:")
        ]).then(() => undefined)
  ]);
}

export async function invalidateCmsRedisCaches() {
  await deleteCachedKeys([
    REDIS_CACHE_KEYS.cmsHomepage,
    REDIS_CACHE_KEYS.cmsShell,
    REDIS_CACHE_KEYS.cmsHero
  ]);
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
