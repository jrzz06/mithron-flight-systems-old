import type { CatalogSearchResult } from "@/services/catalog";
import { getTypesenseConfig, isTypesenseSearchEnabled } from "@/lib/search/search-provider";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

/**
 * Typesense adapter — activated when MITHRON_SEARCH_PROVIDER=typesense and
 * TYPESENSE_HOST + TYPESENSE_API_KEY are configured. Falls back to Postgres FTS
 * via the caller when unavailable or misconfigured.
 */
export async function searchCatalogProductsTypesense(
  query: string,
  limit: number
): Promise<CatalogSearchResult[] | null> {
  if (!isTypesenseSearchEnabled()) return null;

  const config = getTypesenseConfig();
  if (!config) return null;

  const url = new URL(`/collections/${encodeURIComponent(config.collection)}/documents/search`, config.host);
  url.searchParams.set("q", query);
  url.searchParams.set("query_by", "name,tagline,category,search_text");
  url.searchParams.set("per_page", String(limit));

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        "X-TYPESENSE-API-KEY": config.apiKey
      },
      cache: "no-store"
    });
    if (!response.ok) {
      console.warn("[catalog] Typesense search failed.", response.status);
      return null;
    }

    const payload = (await response.json()) as {
      hits?: Array<{ document?: Record<string, unknown> }>;
    };

    const hits = payload.hits ?? [];
    return hits
      .map((hit) => hit.document)
      .filter((doc): doc is Record<string, unknown> => Boolean(doc))
      .map((doc) => ({
        slug: String(doc.slug ?? ""),
        name: String(doc.name ?? ""),
        tagline: String(doc.tagline ?? ""),
        price: Number(doc.price ?? 0),
        badge: typeof doc.badge === "string" ? doc.badge : undefined,
        category: String(doc.category ?? ""),
        image: typeof doc.image === "object" && doc.image ? (doc.image as CatalogSearchResult["image"]) : {
          src: "",
          alt: String(doc.name ?? "")
        },
        availability: typeof doc.availability === "string" ? doc.availability : undefined
      }))
      .filter((item) => item.slug && item.name);
  } catch (error) {
    console.warn("[catalog] Typesense search error.", error);
    return null;
  }
}
