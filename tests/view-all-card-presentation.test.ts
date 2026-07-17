import { describe, expect, it } from "vitest";
import { resolveViewAllCardPresentation } from "@/lib/view-all-card-presentation";

describe("view all card presentation", () => {
  it("returns balanced defaults for unknown slugs", () => {
    expect(resolveViewAllCardPresentation()).toEqual({
      objectPosition: "50% 46%",
      scale: 1,
      padding: "8px 8px 0"
    });
    expect(resolveViewAllCardPresentation("unknown-product")).toEqual({
      objectPosition: "50% 46%",
      scale: 1,
      padding: "8px 8px 0"
    });
  });

  it("applies slug-specific optical framing overrides", () => {
    const spreader = resolveViewAllCardPresentation("source-8kg-seed-spreader-drone-tc-certified");
    expect(spreader.scale).toBeGreaterThan(1);
    expect(spreader.objectPosition).toBe("50% 48%");

    const frame = resolveViewAllCardPresentation("source-decafly-d5x-cfrp-frame");
    expect(frame.scale).toBe(1.1);
    expect(frame.padding).toBe("8px 8px 0");
  });
});
