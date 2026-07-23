import { describe, expect, it } from "vitest";
import { resolveCatalogEditorialPresentation } from "@/lib/media/catalog-editorial-presentation";

describe("catalog editorial presentation", () => {
  it("keeps the seed spreader contained with modest scale", () => {
    const spreader = resolveCatalogEditorialPresentation("source-8kg-seed-spreader-drone-tc-certified");
    expect(spreader.scale).toBeGreaterThan(1);
    expect(spreader.scale).toBeLessThanOrEqual(1.08);
    expect(spreader.objectPosition).toBe("50% 50%");
  });

  it("falls back to contained defaults for other products", () => {
    const generic = resolveCatalogEditorialPresentation("source-agri-kisan-drone-10-liter");
    expect(generic.scale).toBe(1);
    expect(generic.objectPosition).toBe("55% 50%");
  });

  it("gives the MK32 controller room for both antennas", () => {
    const mk32 = resolveCatalogEditorialPresentation(
      "source-siyi-mk-32-agriculture-transmitter-rc-controller-hdmi"
    );
    expect(mk32.scale).toBe(0.9);
    expect(mk32.objectPosition).toBe("50% 46%");
  });
});
