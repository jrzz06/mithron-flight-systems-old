const RECENT_SEARCHES_KEY = "mithron-recent-searches";
const MAX_RECENT_SEARCHES = 8;

function isBrowser() {
  return typeof window !== "undefined";
}

export function readRecentSearches(): string[] {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

export function rememberRecentSearch(query: string) {
  const normalized = query.trim();
  if (!normalized || normalized.length < 2 || !isBrowser()) return;

  const existing = readRecentSearches().filter(
    (item) => item.toLowerCase() !== normalized.toLowerCase()
  );
  const next = [normalized, ...existing].slice(0, MAX_RECENT_SEARCHES);

  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / privacy mode failures.
  }
}

export function clearRecentSearches() {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Ignore storage failures.
  }
}
