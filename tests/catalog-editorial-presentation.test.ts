import { describe, expect, it } from "vitest";
import { resolveCatalogEditorialPresentation } from "@/lib/media/catalog-editorial-presentation";

describe("catalog editorial presentation", () => {
  it("gives the seed spreader extra breathing room at a larger scale", () => {
    const spreader = resolveCatalogEditorialPresentation("source-8kg-seed-spreader-drone-tc-certified");
    expect(spreader.scale).toBeGreaterThan(1.1);
    expect(spreader.scale).toBeLessThanOrEqual(1.2);
    expect(spreader.objectPosition).toBe("50% 50%");
  });

  it("falls back to balanced defaults for other products", () => {
    const generic = resolveCatalogEditorialPresentation("source-agri-kisan-drone-10-liter");
    expect(generic.scale).toBeGreaterThanOrEqual(1.2);
    expect(generic.objectPosition).toBe("50% 46%");
  });
});
