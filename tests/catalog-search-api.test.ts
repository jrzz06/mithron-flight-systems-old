import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkDistributedRateLimit: vi.fn(),
  getCartDrawerSuggestions: vi.fn(),
  getCatalogSearchIndex: vi.fn(),
  getFeaturedSearchProducts: vi.fn(),
  searchCatalogProducts: vi.fn()
}));

vi.mock("@/lib/rate-limit-redis", () => ({
  checkDistributedRateLimit: mocks.checkDistributedRateLimit
}));

vi.mock("@/services/catalog", () => ({
  getCartDrawerSuggestions: mocks.getCartDrawerSuggestions,
  getCatalogSearchIndex: mocks.getCatalogSearchIndex,
  getFeaturedSearchProducts: mocks.getFeaturedSearchProducts,
  searchCatalogProducts: mocks.searchCatalogProducts
}));

import { GET } from "@/app/api/catalog/search/route";

describe("catalog search API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkDistributedRateLimit.mockResolvedValue({ allowed: true });
    mocks.getCatalogSearchIndex.mockResolvedValue([
      {
        slug: "pixy-lr",
        name: "Pixy LR",
        price: 1000,
        tagline: "",
        category: "Video Drones",
        image: { src: "/a.png", alt: "Pixy LR" },
        searchFields: {
          name: "Pixy LR",
          tagline: "",
          slug: "pixy-lr",
          sku: "PIXY-LR",
          category: "Video Drones",
          interests: [],
          anchors: [],
          badge: "",
          description: "",
          sourceDescription: "",
          specs: "",
          sourceCatalogId: ""
        },
        sortOrder: 1
      }
    ]);
    mocks.getFeaturedSearchProducts.mockResolvedValue([
      { slug: "pixy-lr", name: "Pixy LR", price: 1000 }
    ]);
    mocks.getCartDrawerSuggestions.mockResolvedValue([
      { slug: "zio", name: "ZIO", price: 2000 }
    ]);
    mocks.searchCatalogProducts.mockResolvedValue([
      { slug: "pixy-mr", name: "Pixy MR", price: 3000 }
    ]);
  });

  it("returns the cached search index for intent=index", async () => {
    const response = await GET(new Request("http://localhost/api/catalog/search?intent=index"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
    expect(mocks.checkDistributedRateLimit).toHaveBeenCalled();

    const payload = await response.json() as { index: Array<{ slug: string }> };
    expect(payload.index).toHaveLength(1);
    expect(mocks.getCatalogSearchIndex).toHaveBeenCalled();
  });

  it("returns featured products for empty query", async () => {
    const response = await GET(new Request("http://localhost/api/catalog/search"));
    expect(response.status).toBe(200);

    const payload = await response.json() as { results: Array<{ slug: string }> };
    expect(payload.results).toHaveLength(1);
    expect(mocks.getFeaturedSearchProducts).toHaveBeenCalledWith(4);
  });

  it("returns cart suggestions for intent=cart", async () => {
    const response = await GET(new Request("http://localhost/api/catalog/search?intent=cart"));
    expect(response.status).toBe(200);

    const payload = await response.json() as { results: Array<{ slug: string }> };
    expect(payload.results[0]?.slug).toBe("zio");
    expect(mocks.getCartDrawerSuggestions).toHaveBeenCalled();
  });

  it("rejects overly long queries", async () => {
    const longQuery = "a".repeat(121);
    const response = await GET(new Request(`http://localhost/api/catalog/search?q=${longQuery}`));
    expect(response.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    mocks.checkDistributedRateLimit.mockResolvedValue({ allowed: false });
    const response = await GET(new Request("http://localhost/api/catalog/search?q=pixy"));
    expect(response.status).toBe(429);
  });

  it("searches catalog for valid query", async () => {
    const response = await GET(new Request("http://localhost/api/catalog/search?q=pixy&limit=8"));
    expect(response.status).toBe(200);

    const payload = await response.json() as { query: string; results: Array<{ slug: string }> };
    expect(payload.query).toBe("pixy");
    expect(payload.results[0]?.slug).toBe("pixy-mr");
    expect(mocks.searchCatalogProducts).toHaveBeenCalledWith("pixy", 8);
  });
});
