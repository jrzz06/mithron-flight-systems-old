import { describe, expect, it } from "vitest";
import { fieldsFromCatalogRow, queryMatchesProductFields } from "@/lib/product-search-engine";
import {
  fuzzyTokenMatches,
  tokenizeSearchQuery
} from "@/lib/search-query";

describe("search query helpers", () => {
  it("tokenizes multi-word queries", () => {
    expect(tokenizeSearchQuery("Agri Drone")).toEqual(["agri", "drone"]);
  });

  it("matches compact fuzzy brand spellings", () => {
    const haystack = "g-hadron surveillance drone ghadron mapping";
    expect(fuzzyTokenMatches(haystack, "ghadron")).toBe(true);
  });
});

describe("product search integration", () => {
  const agriFields = fieldsFromCatalogRow({
    slug: "source-a10e-agri-drone-10-liters-base",
    name: "A10E Agri Drone 10 Liters Base",
    category: "Agri Drones",
    description: "agri drones spraying systems"
  });

  const gimbalFields = fieldsFromCatalogRow({
    slug: "unrelated-product",
    name: "Industrial Gimbal",
    category: "Stabilization",
    description: "agri drones mapping systems hidden in description only"
  });

  it("matches partial prefixes on primary fields case-insensitively", () => {
    expect(queryMatchesProductFields(agriFields, "agr")).toBe(true);
    expect(queryMatchesProductFields(agriFields, "a")).toBe(true);
  });

  it("rejects single-character description-only matches", () => {
    expect(queryMatchesProductFields(gimbalFields, "a")).toBe(false);
  });

  it("requires all tokens to match", () => {
    expect(queryMatchesProductFields(agriFields, "agri mapping")).toBe(false);
    expect(queryMatchesProductFields(agriFields, "agri drone")).toBe(true);
  });
});
