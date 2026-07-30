import { NextResponse } from "next/server";
import { PUBLIC_EDGE_CACHE_CONTROL } from "@/lib/env";
import { toSlimCatalogSearchIndex } from "@/lib/search/catalog-search-payload";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { getCartDrawerSuggestions, getCatalogSearchIndex, getFeaturedSearchProducts, searchCatalogProducts } from "@/services/catalog";

const MAX_QUERY_LENGTH = 120;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;
const PUBLIC_CACHE_HEADERS = { "Cache-Control": PUBLIC_EDGE_CACHE_CONTROL };

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
        { headers: PUBLIC_CACHE_HEADERS }
      );
    }

    if (intent === "cart") {
      const results = await getCartDrawerSuggestions();
      return NextResponse.json({ query: "", results });
    }

    if (!query) {
      const featured = await getFeaturedSearchProducts(4);
      return NextResponse.json({ query: "", results: featured }, { headers: PUBLIC_CACHE_HEADERS });
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({ error: "Search query is too long." }, { status: 400 });
    }

    const results = await searchCatalogProducts(query, limit);
    return NextResponse.json({ query, results }, { headers: PUBLIC_CACHE_HEADERS });
  } catch (error) {
    console.error("[catalog-search] failed", error);
    return NextResponse.json({ error: "Catalog search failed." }, { status: 500 });
  }
}
