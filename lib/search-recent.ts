const RECENT_SEARCHES_KEY = "mithron-recent-searches";
const MAX_RECENT_SEARCHES = 8;
const OVERLAY_RECENT_LIMIT = 3;

function isBrowser() {
  return typeof window !== "undefined";
}

/** Lowercase key used to collapse slug / title variants of the same query. */
export function recentSearchDedupeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^source[-_]/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

function looksLikeSlug(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^source[-_]/i.test(trimmed)) return true;
  return /^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(trimmed) && !/\s/.test(trimmed);
}

/** Humanize slug-like recent entries for display and storage. */
export function formatRecentSearchLabel(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "";

  if (!looksLikeSlug(trimmed)) {
    return trimmed.replace(/\s+/g, " ");
  }

  return trimmed
    .replace(/^source[-_]/i, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function readRecentSearches(): string[] {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const result: string[] = [];

    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const label = formatRecentSearchLabel(item);
      if (!label || label.length < 2) continue;
      const key = recentSearchDedupeKey(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(label);
      if (result.length >= MAX_RECENT_SEARCHES) break;
    }

    return result;
  } catch {
    return [];
  }
}

/** Recents for the search overlay idle list (capped). */
export function readOverlayRecentSearches(limit = OVERLAY_RECENT_LIMIT): string[] {
  return readRecentSearches().slice(0, limit);
}

export function rememberRecentSearch(query: string) {
  const label = formatRecentSearchLabel(query);
  if (!label || label.length < 2 || !isBrowser()) return;

  const key = recentSearchDedupeKey(label);
  const existing = readRecentSearches().filter((item) => recentSearchDedupeKey(item) !== key);
  const next = [label, ...existing].slice(0, MAX_RECENT_SEARCHES);

  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / privacy mode failures.
  }
}
