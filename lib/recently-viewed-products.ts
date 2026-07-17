import type { MediaAsset } from "@/config/types";

export type RecentlyViewedProduct = {
  slug: string;
  name: string;
  price: number;
  category: string;
  tagline: string;
  badge?: string;
  image: Pick<MediaAsset, "src" | "responsive">;
  viewedAt: number;
};

export const RECENTLY_VIEWED_STORAGE_KEY = "mithron-recently-viewed";
export const RECENTLY_VIEWED_MAX_STORED = 8;
export const RECENTLY_VIEWED_MAX_DISPLAY = 4;

export function readRecentlyViewedProducts(): RecentlyViewedProduct[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentlyViewedProduct[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item?.slug === "string" && typeof item?.name === "string");
  } catch {
    return [];
  }
}

export function writeRecentlyViewedProducts(items: RecentlyViewedProduct[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(items.slice(0, RECENTLY_VIEWED_MAX_STORED)));
}

export function recordRecentlyViewedProduct(
  product: Omit<RecentlyViewedProduct, "viewedAt">,
  existing = readRecentlyViewedProducts()
): RecentlyViewedProduct[] {
  const nextEntry: RecentlyViewedProduct = { ...product, viewedAt: Date.now() };
  const withoutCurrent = existing.filter((item) => item.slug !== product.slug);
  const next = [nextEntry, ...withoutCurrent].slice(0, RECENTLY_VIEWED_MAX_STORED);
  writeRecentlyViewedProducts(next);
  return next;
}

export function getRecentlyViewedForDisplay(currentSlug: string, items = readRecentlyViewedProducts()) {
  return items
    .filter((item) => item.slug !== currentSlug)
    .slice(0, RECENTLY_VIEWED_MAX_DISPLAY);
}
