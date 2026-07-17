import {
  capacityClusterKey,
  normalizeCatalogName,
  normalizeUrl,
  slugify
} from "../wix/catalog-normalize.ts";
import type { WixProductSnapshot } from "../wix/catalog-client.ts";
import type { DbProductRow } from "./score-canonical.ts";

export type ProductReconcileReport = {
  version: 1;
  generated_at: string;
  summary: {
    wix_count: number;
    db_count: number;
    matched_ok: number;
    price_drift: number;
    description_drift: number;
    duplicate_clusters: number;
    wix_only: number;
    db_only: number;
    broken_image_slugs: number;
  };
  matched_ok: Array<{ slug: string; wix_slug: string }>;
  price_drift: Array<{ slug: string; wix_slug: string; db_price: number; wix_price: number }>;
  description_drift: Array<{ slug: string; wix_slug: string }>;
  duplicate_clusters: Array<{
    cluster_id: string;
    reason: string;
    slugs: string[];
    wix_product_id?: string;
  }>;
  wix_only: Array<{ wix_slug: string; name: string }>;
  db_only: Array<{ slug: string; name: string }>;
  broken_image_slugs: string[];
  wix_by_slug: Record<string, WixProductSnapshot>;
  db_slug_to_wix_slug: Record<string, string>;
};

class UnionFind {
  parent = new Map<string, string>();

  find(value: string): string {
    const parent = this.parent.get(value) ?? value;
    if (parent !== value) {
      const root = this.find(parent);
      this.parent.set(value, root);
      return root;
    }
    this.parent.set(value, value);
    return value;
  }

  union(a: string, b: string) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

function isBrokenImage(row: DbProductRow) {
  const src = row.image?.src ?? "";
  if (!src.trim()) return true;
  if (/placeholder|broken/i.test(src)) return true;
  return false;
}

function matchDbRowToWix(row: DbProductRow, wixProducts: WixProductSnapshot[]) {
  const byCatalogId = new Map(wixProducts.map((p) => [p.source_catalog_id, p]));
  const byUrl = new Map(wixProducts.map((p) => [normalizeUrl(p.source_url), p]));
  const byWixSlug = new Map(wixProducts.map((p) => [p.wix_slug, p]));
  const byDbSlug = new Map(wixProducts.map((p) => [`source-${slugify(p.name)}`, p]));

  if (row.source_catalog_id && byCatalogId.has(row.source_catalog_id)) {
    return byCatalogId.get(row.source_catalog_id)!;
  }
  if (row.source_url && byUrl.has(normalizeUrl(row.source_url))) {
    return byUrl.get(normalizeUrl(row.source_url))!;
  }
  if (byWixSlug.has(row.slug)) return byWixSlug.get(row.slug)!;
  if (byDbSlug.has(row.slug)) return byDbSlug.get(row.slug)!;
  if (row.slug.startsWith("source-")) {
    const tail = row.slug.slice("source-".length);
    if (byWixSlug.has(tail)) return byWixSlug.get(tail)!;
  }

  const normalizedName = normalizeCatalogName(row.name);
  const nameMatch = wixProducts.find((p) => normalizeCatalogName(p.name) === normalizedName);
  return nameMatch ?? null;
}

export function buildProductReconcileReport(
  wixProducts: WixProductSnapshot[],
  dbRows: DbProductRow[]
): ProductReconcileReport {
  const activeRows = dbRows.filter((row) => row.merge_status !== "archived_merged");
  const wixBySlug = Object.fromEntries(wixProducts.map((p) => [p.wix_slug, p]));
  const matchedOk: ProductReconcileReport["matched_ok"] = [];
  const priceDrift: ProductReconcileReport["price_drift"] = [];
  const descriptionDrift: ProductReconcileReport["description_drift"] = [];
  const dbSlugToWixSlug: Record<string, string> = {};
  const matchedWixIds = new Set<string>();
  const matchedDbSlugs = new Set<string>();

  for (const row of activeRows) {
    const wix = matchDbRowToWix(row, wixProducts);
    if (!wix) continue;
    matchedWixIds.add(wix.wix_product_id);
    matchedDbSlugs.add(row.slug);
    dbSlugToWixSlug[row.slug] = wix.wix_slug;

    const priceMatches = Number(row.price ?? 0) === Number(wix.price);
    const descriptionMatches =
      normalizeCatalogName(row.source_description ?? row.description ?? "") ===
      normalizeCatalogName(wix.description_plain);

    if (priceMatches && descriptionMatches) {
      matchedOk.push({ slug: row.slug, wix_slug: wix.wix_slug });
      continue;
    }
    if (!priceMatches) {
      priceDrift.push({
        slug: row.slug,
        wix_slug: wix.wix_slug,
        db_price: Number(row.price ?? 0),
        wix_price: Number(wix.price)
      });
    }
    if (!descriptionMatches) {
      descriptionDrift.push({ slug: row.slug, wix_slug: wix.wix_slug });
    }
  }

  const uf = new UnionFind();
  const clusterReasons = new Map<string, string>();

  for (const row of activeRows) {
    uf.find(row.slug);
  }

  for (const row of activeRows) {
    const wix = matchDbRowToWix(row, wixProducts);
    if (wix) {
      for (const other of activeRows) {
        if (other.slug === row.slug) continue;
        const otherWix = matchDbRowToWix(other, wixProducts);
        if (otherWix?.wix_product_id === wix.wix_product_id) {
          uf.union(row.slug, other.slug);
          clusterReasons.set(uf.find(row.slug), "same_wix_product_id");
        }
      }
    }
  }

  const byNameCategory = new Map<string, string[]>();
  for (const row of activeRows) {
    const key = `${row.category ?? "unknown"}::${normalizeCatalogName(row.name)}`;
    const list = byNameCategory.get(key) ?? [];
    list.push(row.slug);
    byNameCategory.set(key, list);
  }
  for (const [key, slugs] of byNameCategory) {
    if (slugs.length < 2) continue;
    const [first, ...rest] = slugs;
    for (const slug of rest) {
      uf.union(first, slug);
      clusterReasons.set(uf.find(first), `same_normalized_name:${key}`);
    }
  }

  const byCapacity = new Map<string, string[]>();
  for (const row of activeRows) {
    const key = capacityClusterKey(row.name, row.category ?? "unknown");
    if (!key) continue;
    const list = byCapacity.get(key) ?? [];
    list.push(row.slug);
    byCapacity.set(key, list);
  }
  for (const [key, slugs] of byCapacity) {
    if (slugs.length < 2) continue;
    const [first, ...rest] = slugs;
    for (const slug of rest) {
      uf.union(first, slug);
      clusterReasons.set(uf.find(first), `capacity_cluster:${key}`);
    }
  }

  const clusterMap = new Map<string, Set<string>>();
  for (const row of activeRows) {
    const root = uf.find(row.slug);
    const set = clusterMap.get(root) ?? new Set<string>();
    set.add(row.slug);
    clusterMap.set(root, set);
  }

  const duplicateClusters = [...clusterMap.entries()]
    .filter(([, slugs]) => slugs.size > 1)
    .map(([clusterId, slugs]) => {
      const slugList = [...slugs].sort();
      const wix = matchDbRowToWix(activeRows.find((r) => r.slug === slugList[0])!, wixProducts);
      return {
        cluster_id: clusterId,
        reason: clusterReasons.get(clusterId) ?? "clustered",
        slugs: slugList,
        wix_product_id: wix?.wix_product_id
      };
    });

  const wixOnly = wixProducts
    .filter((p) => !matchedWixIds.has(p.wix_product_id) && p.visible)
    .map((p) => ({ wix_slug: p.wix_slug, name: p.name }));

  const dbOnly = activeRows
    .filter((row) => !matchedDbSlugs.has(row.slug) && row.is_visible !== false)
    .map((row) => ({ slug: row.slug, name: row.name }));

  const brokenImageSlugs = activeRows.filter(isBrokenImage).map((row) => row.slug);

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    summary: {
      wix_count: wixProducts.length,
      db_count: activeRows.length,
      matched_ok: matchedOk.length,
      price_drift: priceDrift.length,
      description_drift: descriptionDrift.length,
      duplicate_clusters: duplicateClusters.length,
      wix_only: wixOnly.length,
      db_only: dbOnly.length,
      broken_image_slugs: brokenImageSlugs.length
    },
    matched_ok: matchedOk,
    price_drift: priceDrift,
    description_drift: descriptionDrift,
    duplicate_clusters: duplicateClusters,
    wix_only: wixOnly,
    db_only: dbOnly,
    broken_image_slugs: brokenImageSlugs,
    wix_by_slug: wixBySlug,
    db_slug_to_wix_slug: dbSlugToWixSlug
  };
}
