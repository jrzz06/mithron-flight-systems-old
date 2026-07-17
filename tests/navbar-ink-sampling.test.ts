import { describe, expect, it } from "vitest";
import {
  inkFromHexColor,
  inkFromLuminance,
  inkFromLuminanceSamples,
  resolveInitialNavbarTone,
  resolveNavbarSampleXsFromRect
} from "@/lib/navbar-ink-sampling";

describe("navbar ink sampling", () => {
  it("uses light ink on dark hero regions", () => {
    expect(inkFromLuminance(0.18)).toBe("light");
    expect(inkFromHexColor("#182828")).toBe("light");
  });

  it("uses dark ink on bright hero regions", () => {
    expect(inkFromLuminance(0.82)).toBe("dark");
    expect(inkFromHexColor("#f8f8f8")).toBe("dark");
  });

  it("uses dark ink when any sampled region is bright", () => {
    expect(inkFromLuminanceSamples([0.2, 0.75])).toBe("dark");
  });

  it("uses light ink when all sampled regions are dark", () => {
    expect(inkFromLuminanceSamples([0.2, 0.4])).toBe("light");
  });

  it("returns null when no luminance samples are available", () => {
    expect(inkFromLuminanceSamples([])).toBeNull();
  });

  it("resolves three distinct navbar sample positions from a bar rect", () => {
    const sampleXs = resolveNavbarSampleXsFromRect(100, 1000);
    expect(sampleXs).toHaveLength(3);
    expect(new Set(sampleXs).size).toBe(3);
    expect(sampleXs[0]).toBe(280);
    expect(sampleXs[1]).toBe(600);
    expect(sampleXs[2]).toBe(920);
  });

  it("resolves SSR-safe initial navbar tone for hero-backed routes", () => {
    expect(resolveInitialNavbarTone("/")).toBe("light");
    expect(resolveInitialNavbarTone("/category/agri-drones")).toBe("dark");
    expect(resolveInitialNavbarTone("/category/video-drones")).toBe("dark");
    expect(resolveInitialNavbarTone("/agriculture")).toBe("light");
    expect(resolveInitialNavbarTone("/products")).toBe("dark");
    expect(resolveInitialNavbarTone("/product/example")).toBe("dark");
  });
});
