import { describe, expect, it } from "vitest";
import {
  expandSpecEntries,
  formatAvailability,
  isHighlightSpecValue,
  isSpecLikeBlob,
  parseInlineSpecPairs,
  sortSpecEntries
} from "@/lib/product-spec-text";
import { getProductMarketingTagline } from "@/lib/product-marketing-copy";

const MULTISPECTRAL_SPEC_BLOB =
  "UAV Type: HexacopterUAV Category: SmallEndurance: 28 minRange (LoS): 1 kmMaximum All-Up-Weight: 8.56 kgWind Resistance: 9.7 m/s (18.8 knots)Maximum Speed: 10 m/s (36 kmph)Operating Altitude:";

const MINI_X_NANO_BLOB =
  "96 mins with 3 x 2600mAh batteries, speeds up to 58 km/h. Precise Navigation: GPS/GLONASS, RTH function, IZI Sky Eye App support, 128 GB SD slot. High-Speed Performance: Capture vertical shots, stable flight, and speeds up to 58 km/h. Ample Storage: 128 GB SD slot and 1-Year Warranty.";

const DRONE_SOCCER_BATTERY_VALUE = "1 no's ( included) 4s (850mah) 4.";

const BATTERY_VALUE_THEN_LABEL_BLOB = "Type: Certified 21000 mAh Li-Ion Battery Weight: 1.2 kg";

describe("product spec text", () => {
  it("detects concatenated scrape spec blobs", () => {
    expect(isSpecLikeBlob(MULTISPECTRAL_SPEC_BLOB)).toBe(true);
    expect(isSpecLikeBlob("High-precision mapping workflow.")).toBe(false);
  });

  it("detects dash-separated spec lists", () => {
    const dashBlob =
      "UAV Type - Hexacopter Endurance - 28 min Range (LoS) - 1 km Maximum All-Up-Weight - 8.56 kg";
    expect(isSpecLikeBlob(dashBlob)).toBe(true);
  });

  it("parses glued inline spec pairs from source descriptions", () => {
    const pairs = parseInlineSpecPairs(MULTISPECTRAL_SPEC_BLOB);

    expect(pairs["UAV Type"]).toBe("Hexacopter");
    expect(pairs["UAV Category"]).toBe("Small");
    expect(pairs["Endurance"]).toBe("28 min");
    expect(pairs["Range (LoS)"]).toBe("1 km");
    expect(pairs["Maximum All-Up-Weight"]).toBe("8.56 kg");
    expect(pairs["Wind Resistance"]).toBe("9.7 m/s (18.8 knots)");
    expect(pairs["Maximum Speed"]).toBe("10 m/s (36 kmph)");
  });

  it("formats availability labels for display", () => {
    expect(formatAvailability("InStock")).toBe("In stock");
    expect(formatAvailability("OutOfStock")).toBe("Out of stock");
  });

  it("sorts flight specs ahead of generic metadata", () => {
    const sorted = sortSpecEntries([
      ["Category", "Video Drones"],
      ["Endurance", "28 min"],
      ["UAV Type", "Hexacopter"]
    ]);

    expect(sorted.map(([key]) => key)).toEqual(["UAV Type", "Endurance", "Category"]);
  });

  it("extracts measurable metrics without promoting marketing prose into specs", () => {
    const expanded = expandSpecEntries([["Flight Time", MINI_X_NANO_BLOB]]);

    expect(expanded.map(([key]) => key)).toEqual(
      expect.arrayContaining(["Flight Time", "Maximum Speed", "Battery"])
    );
    expect(expanded.map(([key]) => key)).not.toContain("Precise Navigation");
    expect(expanded.map(([key]) => key)).not.toContain("High-Speed Performance");
    expect(expanded.find(([key]) => key === "Flight Time")?.[1]).toBe("96 mins");
  });

  it("keeps highlight cards short", () => {
    const expanded = expandSpecEntries([["Flight Time", MINI_X_NANO_BLOB]]);
    const highlights = expanded.filter(([, value]) => isHighlightSpecValue(value));
    expect(highlights.length).toBeGreaterThanOrEqual(3);
    expect(highlights.every(([, value]) => value.length <= 56)).toBe(true);
  });

  it("strips trailing numbered-list noise from an already-short Battery value", () => {
    const expanded = expandSpecEntries([["Battery", DRONE_SOCCER_BATTERY_VALUE]]);
    const battery = expanded.find(([label]) => label === "Battery");
    expect(battery?.[1]).toBeDefined();
    expect(battery?.[1]).not.toMatch(/4\.\s*$/);
    expect(battery?.[1]).toMatch(/850mah/i);
  });

  it("extracts Battery value when it precedes the label word (value-then-label pattern)", () => {
    const expanded = expandSpecEntries([["Battery", BATTERY_VALUE_THEN_LABEL_BLOB]]);
    const battery = expanded.find(([label]) => label === "Battery");
    expect(battery?.[1]).toMatch(/21000\s*mAh/i);
  });

  it("canonicalizes stray trailing colons and casing in stored spec keys", () => {
    const expanded = expandSpecEntries([
      ["Power Rating:", "488.4wh"],
      ["flight time", "28 min"]
    ]);
    expect(expanded.some(([key]) => key === "Power Rating:")).toBe(false);
    expect(expanded.find(([key]) => key.toLowerCase() === "flight time")?.[0]).toBe("Flight Time");
  });
});

describe("product marketing copy", () => {
  it("returns category tagline instead of spec blobs", () => {
    expect(
      getProductMarketingTagline({
        name: "Multispectral Camera Survey Drone",
        category: "Video Drones",
        tagline: MULTISPECTRAL_SPEC_BLOB,
        sourceDescription: MULTISPECTRAL_SPEC_BLOB
      })
    ).toBe("High-precision mapping workflow.");
  });
});
