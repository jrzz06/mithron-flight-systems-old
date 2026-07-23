import { describe, expect, it } from "vitest";
import { compactProductMeta, formatShelfProductName } from "@/lib/product-shelf-card-meta";

describe("formatShelfProductName", () => {
  it("title-cases ALL-CAPS marketing names while preserving model tokens", () => {
    expect(formatShelfProductName("SKY PRO 4K VIDEOGRAPHY DRONE")).toBe(
      "Sky Pro 4K Videography Drone"
    );
    expect(formatShelfProductName("MINI X NANO 4K VIDEOGRAPHY DRONE")).toBe(
      "Mini X Nano 4K Videography Drone"
    );
  });

  it("preserves short acronyms and digit model codes", () => {
    expect(formatShelfProductName("Siyi MK15 Agriculture Transmitter RC Controller")).toBe(
      "Siyi MK15 Agriculture Transmitter RC Controller"
    );
    expect(formatShelfProductName("V9 Flight Controller For Agriculture Drones")).toBe(
      "V9 Flight Controller For Agriculture Drones"
    );
  });

  it("preserves bracket tags", () => {
    expect(formatShelfProductName("Drone Kit [PRO]")).toBe("Drone Kit [PRO]");
  });

  it("keeps measurement units lowercase", () => {
    expect(formatShelfProductName("Drone Soccer (200 mm)")).toBe("Drone Soccer (200 mm)");
    expect(formatShelfProductName("Drone Soccer (150 MM)")).toBe("Drone Soccer (150 mm)");
  });
});

describe("compactProductMeta", () => {
  it("clips kickers on a word boundary with ellipsis", () => {
    const { detail } = compactProductMeta({
      tagline: "Useful Product for Women Pilot Entrepreneurs in Rural Markets"
    });
    expect(detail).toBe("Useful Product for Women Pilot...");
    expect(detail!.endsWith("...")).toBe(true);
  });
});
