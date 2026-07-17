import { describe, expect, it } from "vitest";
import {
  categoryMatchesSearchQuery,
  fieldsFromCatalogRow,
  queryMatchesProductFields,
  scoreProductSearch,
  tokenMatchesFields,
  wordStartsWithToken
} from "@/lib/product-search-engine";

const agriDroneFields = fieldsFromCatalogRow({
  slug: "source-a10e-agri-drone-10-liters-base",
  name: "A10E Agri Drone 10 Liters Base",
  tagline: "Precision agriculture spraying",
  category: "Agri Drones"
});

const batteryFields = fieldsFromCatalogRow({
  slug: "source-drone-battery",
  name: "Drone Battery Pack",
  tagline: "Replacement power module",
  category: "Power Systems",
  description: "High-capacity lithium battery for mapping drones"
});

const gimbalFields = fieldsFromCatalogRow({
  slug: "unrelated-product",
  name: "Industrial Gimbal",
  tagline: "Precision stabilization",
  category: "Stabilization",
  description: "Contains many vowels including a letter throughout the body copy"
});

const ghadronFields = fieldsFromCatalogRow({
  slug: "g-hadron",
  name: "G-HADRON",
  tagline: "Surveillance platform",
  category: "Surveillance Drones",
  interests: ["ghadron mapping"]
});

describe("product search engine", () => {
  it("matches word-start prefixes for short tokens", () => {
    expect(wordStartsWithToken("Agri Drones", "a")).toBe(true);
    expect(wordStartsWithToken("battery pack", "a")).toBe(false);
    expect(wordStartsWithToken("A10E Agri Drone", "a")).toBe(true);
  });

  it("matches agri drone products for single-character primary prefixes", () => {
    expect(queryMatchesProductFields(agriDroneFields, "a")).toBe(true);
    expect(queryMatchesProductFields(agriDroneFields, "ag")).toBe(true);
    expect(queryMatchesProductFields(agriDroneFields, "agr")).toBe(true);
  });

  it("rejects description-only single-character matches", () => {
    expect(queryMatchesProductFields(gimbalFields, "a")).toBe(false);
    expect(queryMatchesProductFields(batteryFields, "a")).toBe(false);
  });

  it("requires all tokens to match multi-word queries", () => {
    expect(queryMatchesProductFields(agriDroneFields, "agri drone")).toBe(true);
    expect(queryMatchesProductFields(agriDroneFields, "agri mapping")).toBe(false);
  });

  it("opens secondary and tertiary tiers as tokens grow", () => {
    const batteryWithInterest = fieldsFromCatalogRow({
      slug: "source-drone-battery",
      name: "Drone Battery Pack",
      category: "Power",
      interests: ["mapping payloads"],
      description: "High-capacity lithium battery"
    });
    expect(tokenMatchesFields("map", batteryWithInterest).tier).toBe("secondary");
    expect(tokenMatchesFields("lithium", batteryFields).tier).toBe("tertiary");
    expect(tokenMatchesFields("a", batteryFields).match).toBe(false);
  });

  it("keeps fuzzy compact matching for longer tokens", () => {
    expect(queryMatchesProductFields(ghadronFields, "ghadron")).toBe(true);
  });

  it("ranks exact and prefix name matches above tertiary matches", () => {
    const exact = scoreProductSearch(agriDroneFields, "a10e agri drone 10 liters base");
    const prefix = scoreProductSearch(agriDroneFields, "a10e");
    const tertiaryOnly = scoreProductSearch(batteryFields, "lithium");
    expect(exact).toBeGreaterThan(tertiaryOnly);
    expect(prefix).toBeGreaterThan(tertiaryOnly);
  });

  it("matches categories using primary-tier rules only", () => {
    expect(categoryMatchesSearchQuery("Agri Drones", "agr")).toBe(true);
    expect(categoryMatchesSearchQuery("Stabilization", "a")).toBe(false);
  });
});
