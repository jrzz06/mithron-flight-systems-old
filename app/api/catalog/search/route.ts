import { NextResponse } from "next/server";
import { toSlimCatalogSearchIndex } from "@/lib/search/catalog-search-payload";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { getCartDrawerSuggestions, getCatalogSearchIndex, getFeaturedSearchProducts, searchCatalogProducts } from "@/services/catalog";

const MAX_QUERY_LENGTH = 120;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;
const INDEX_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=600";

function parseLimit(value: string | null) {
  if (!value?.trim()) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const intent = url.searchParams.get("intent")?.trim() ?? "";
  const limit = parseLimit(url.searchParams.get("limit"));

  try {
    const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
    const limiter = await checkDistributedRateLimit(`catalog-search:${rateKey}`, 120, 60_000);

    if (!limiter.allowed) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    if (intent === "index") {
      const index = await getCatalogSearchIndex();
      return NextResponse.json(
        { query: "", index: toSlimCatalogSearchIndex(index) },
        { headers: { "Cache-Control": INDEX_CACHE_CONTROL } }
      );
    }

    if (intent === "cart") {
      const results = await getCartDrawerSuggestions();
      return NextResponse.json({ query: "", results });
    }

    if (!query) {
      const featured = await getFeaturedSearchProducts(4);
      return NextResponse.json({ query: "", results: featured });
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({ error: "Search query is too long." }, { status: 400 });
    }

    const results = await searchCatalogProducts(query, limit);
    return NextResponse.json({ query, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog search failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
