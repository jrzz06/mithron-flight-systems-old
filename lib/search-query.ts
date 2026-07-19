/** Shared storefront search tokenization and fuzzy matching. */

export const SEARCH_DEBOUNCE_MS = 200;
export const MIN_SEARCH_QUERY_LENGTH = 1;
export const MIN_SEARCH_TOKEN_LENGTH = 1;
export const SEARCH_SECONDARY_MIN_TOKEN = 3;
export const SEARCH_TERTIARY_MIN_TOKEN = 4;

export function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

export function compactSearchText(value: string) {
  return normalizeSearchText(value).replace(/[^a-z0-9]/g, "");
}

export function tokenizeSearchQuery(query: string) {
  return normalizeSearchText(query)
    .split(/\s+/)
    .filter((token) => token.length >= MIN_SEARCH_TOKEN_LENGTH);
}

export function isSubsequenceMatch(haystack: string, needle: string) {
  if (!needle) return true;
  if (needle.length > haystack.length) return false;

  let haystackIndex = 0;
  for (const char of needle) {
    haystackIndex = haystack.indexOf(char, haystackIndex);
    if (haystackIndex === -1) return false;
    haystackIndex += 1;
  }
  return true;
}

export function fuzzyTokenMatches(haystack: string, token: string) {
  const normalizedHaystack = normalizeSearchText(haystack);
  const normalizedToken = normalizeSearchText(token);
  if (!normalizedToken) return true;
  if (normalizedHaystack.includes(normalizedToken)) return true;

  const compactHaystack = compactSearchText(haystack);
  const compactToken = compactSearchText(token);
  if (!compactToken) return true;
  if (compactHaystack.includes(compactToken)) return true;

  if (compactToken.length >= 4 && isSubsequenceMatch(compactHaystack, compactToken)) {
    return true;
  }

  return false;
}

export function searchHaystackMatchesQuery(haystack: string, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  if (normalizedQuery.length < MIN_SEARCH_QUERY_LENGTH) return false;

  if (fuzzyTokenMatches(haystack, normalizedQuery)) return true;

  const tokens = tokenizeSearchQuery(normalizedQuery);
  if (!tokens.length) {
    return fuzzyTokenMatches(haystack, normalizedQuery);
  }

  return tokens.every((token) => fuzzyTokenMatches(haystack, token));
}

export function mergeSearchResultsBySlug<T extends { slug: string }>(
  primary: T[],
  secondary: T[],
  limit: number
) {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const item of [...primary, ...secondary]) {
    if (!item.slug || seen.has(item.slug)) continue;
    seen.add(item.slug);
    merged.push(item);
    if (merged.length >= limit) break;
  }

  return merged;
}
