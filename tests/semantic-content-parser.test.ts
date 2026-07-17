import { describe, expect, it } from "vitest";
import {
  classifyColonPair,
  isPollutedSpecEntry,
  parseColonPairsFromText,
  parseSemanticProductHtml,
  scrubPollutedSpecs
} from "@/lib/wix/semantic-content-parser";

describe("semantic content parser", () => {
  it("preserves numeric prefixes in feature titles", () => {
    const text =
      "4K 20MP Camera: Capture stunning aerial footage with a 1-inch sensor. 32 Minutes Flight Time: Extended missions without frequent battery swaps.";
    const pairs = parseColonPairsFromText(text);

    expect(pairs.map((pair) => pair.title)).toEqual(["4K 20MP Camera", "32 Minutes Flight Time"]);
    expect(pairs[0].body).toContain("1-inch sensor");
  });

  it("classifies marketing features separately from measurable specs", () => {
    const content = parseSemanticProductHtml(
      "<p>4K 20MP Camera: Professional imaging with advanced stabilization. Flight Time: 32 min. Package includes – 1 unit drone, 2 batteries.</p>"
    );

    expect(content.features.some((feature) => feature.title === "4K 20MP Camera")).toBe(true);
    expect(content.technical_specs["Flight Time"]).toBe("32 min");
    expect(content.package_contents.some((line) => /unit drone/i.test(line))).toBe(true);
    expect(isPollutedSpecEntry("4K 20MP Camera", "Professional imaging with advanced stabilization")).toBe(true);
  });

  it("routes disclaimers and warranty out of specification tables", () => {
    const content = parseSemanticProductHtml(
      "<p>Exclusive of GST. 1-Year Warranty included with every unit. Endurance: 28 min</p>"
    );

    expect(content.disclaimers.some((line) => /gst/i.test(line))).toBe(true);
    expect(content.warranty).toMatch(/1-Year Warranty/i);
    expect(content.technical_specs.Endurance).toBe("28 min");
  });

  it("scrubs polluted spec rows", () => {
    const cleaned = scrubPollutedSpecs({
      "Flight Time": "32 min",
      "Precise Navigation": "GPS/GLONASS, RTH function, IZI Sky Eye App support, 128 GB SD slot.",
      "K 20MP Camera": "Broken title from legacy import"
    });

    expect(cleaned["Flight Time"]).toBe("32 min");
    expect(cleaned["Precise Navigation"]).toBeUndefined();
    expect(cleaned["K 20MP Camera"]).toBeUndefined();
  });

  it("classifies colon pairs using measurable values", () => {
    expect(classifyColonPair("Maximum Speed", "58 km/h")).toBe("spec");
    expect(classifyColonPair("4K 20MP Camera", "Capture vertical shots with stabilized flight")).toBe("feature");
    expect(classifyColonPair("GST", "Exclusive of GST and subject to change")).toBe("disclaimer");
  });

  it("routes dash-list specs out of overview_html", () => {
    const content = parseSemanticProductHtml(
      "<ul><li>UAV Type - Hexacopter</li><li>Endurance - 28 min</li><li>Range (LoS) - 1 km</li></ul>"
    );

    expect(content.highlight_specs["UAV Type"]).toBe("Hexacopter");
    expect(content.highlight_specs.Endurance).toBe("28 min");
    expect(content.highlight_specs["Range (LoS)"]).toBe("1 km");
    expect(content.overview_html).toBe("");
    expect(content.overview_plain).toBe("");
  });

  it("keeps spec-only products from falling back to raw html overview", () => {
    const content = parseSemanticProductHtml(
      "<p>UAV Type:&nbsp;Hexacopter</p><p>UAV Category:&nbsp;Small</p><p>Endurance:&nbsp;28 min</p>"
    );

    expect(content.technical_specs["UAV Type"]).toBe("Hexacopter");
    expect(content.technical_specs["UAV Category"]).toBe("Small");
    expect(content.technical_specs.Endurance).toBe("28 min");
    expect(content.overview_html).toBe("");
    expect(content.overview_plain).toBe("");
  });

  it("keeps marketing prose in overview while routing specs separately", () => {
    const content = parseSemanticProductHtml(
      "<p>Built for precision agriculture missions with operator-ready deployment workflows.</p><ul><li>Endurance - 28 min</li><li>Range (LoS) - 1 km</li></ul>"
    );

    expect(content.overview_html).toContain("precision agriculture missions");
    expect(content.highlight_specs.Endurance).toBe("28 min");
    expect(content.highlight_specs["Range (LoS)"]).toBe("1 km");
  });
});
