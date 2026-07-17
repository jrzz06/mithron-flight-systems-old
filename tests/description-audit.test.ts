import { describe, expect, it } from "vitest";
import {
  assessDescriptionCleanup,
  auditProductDescription,
  buildVerifiedFallbackDescription,
  descriptionQualityScore,
  isAcceptableDescription,
  isMigrationArtifactText,
  normalizeDescriptionHtml,
  stripMigrationArtifactsFromHtml
} from "@/lib/product-migration/description-audit";

describe("description-audit", () => {
  it("detects migration artifact phrases without flagging legitimate import copy", () => {
    expect(isMigrationArtifactText("Imported from live Wix product")).toBe(true);
    expect(isMigrationArtifactText("Bearings: Imported from Japan")).toBe(false);
  });

  it("cleans migration artifacts and duplicate paragraphs", () => {
    const html =
      "<p>Imported from Wix</p><p>Professional spray platform for field operations.</p><p>Professional spray platform for field operations.</p>";
    const cleaned = normalizeDescriptionHtml(html);
    expect(cleaned).toContain("Professional spray platform");
    expect(cleaned).not.toMatch(/imported from wix/i);
    expect(stripMigrationArtifactsFromHtml(html).match(/Professional spray platform/g)?.length).toBe(2);
  });

  it("builds verified fallback copy from existing database fields only", () => {
    const fallback = buildVerifiedFallbackDescription({
      slug: "source-gnss-module",
      name: "GNSS MODULE",
      category: "Accessories",
      specs: { "Operating Voltage": "12V DC" }
    });
    expect(fallback?.html).toContain("GNSS MODULE");
    expect(fallback?.html).toContain("Operating Voltage");
    expect(fallback?.html).not.toMatch(/flight time|payload capacity|tc certified/i);
  });

  it("skips acceptable descriptions", () => {
    const acceptable =
      "<p>This is a detailed product overview with enough substance for procurement teams to understand the mission fit and operating envelope for field deployment.</p>";
    expect(isAcceptableDescription(acceptable)).toBe(true);
    const row = {
      slug: "good-product",
      name: "Good Product",
      category: "Agri Drones",
      description: acceptable
    };
    expect(assessDescriptionCleanup(row).needsCleanup).toBe(false);
    expect(auditProductDescription(row, null).action).toBe("skip_acceptable");
  });

  it("scores structured descriptions higher than plain spec blobs", () => {
    const blob = "Motor Type: Brushless KV Rating: 150 rpm/V Stator Size: 62 x 18 mm LiPo Battery Cell Count: 12-14S";
    const structured =
      "<ul><li><strong>Motor Type</strong>: Brushless</li><li><strong>KV Rating</strong>: 150 rpm/V</li><li><strong>Stator Size</strong>: 62 x 18 mm</li></ul>";
    expect(descriptionQualityScore(blob)).toBeLessThan(descriptionQualityScore(structured));
  });
});
