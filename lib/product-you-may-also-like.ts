import type { ProductShellItem } from "@/services/catalog";

export type YouMayAlsoLikeCurrent = {
  slug: string;
  category: string;
  interests: string[];
  price: number;
};

export function rankYouMayAlsoLikeCandidates(
  current: YouMayAlsoLikeCurrent,
  candidates: ProductShellItem[],
  limit = 4
): ProductShellItem[] {
  const pool = candidates.filter((candidate) => candidate.slug !== current.slug);
  const picked = new Set<string>();
  const result: ProductShellItem[] = [];

  const take = (items: ProductShellItem[]) => {
    for (const item of items) {
      if (result.length >= limit) return;
      if (picked.has(item.slug)) continue;
      picked.add(item.slug);
      result.push(item);
    }
  };

  take(pool.filter((item) => item.category === current.category));
  take(pool.filter((item) => item.interests.some((interest) => current.interests.includes(interest))));

  const priceMin = current.price * 0.75;
  const priceMax = current.price * 1.25;
  take(pool.filter((item) => item.price >= priceMin && item.price <= priceMax));
  take(pool);

  return result.slice(0, limit);
}
