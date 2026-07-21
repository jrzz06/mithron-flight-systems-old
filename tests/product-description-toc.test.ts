import { describe, expect, it } from "vitest";
import { prepareProductDescriptionToc } from "@/lib/product-description-toc";

describe("prepareProductDescriptionToc", () => {
  it("injects ids for headings and feature cards in document order", () => {
    const html = [
      "<p>Intro</p>",
      "<h2>Flight performance</h2>",
      '<div data-type="feature-card" data-title="Long endurance" data-description="Up to 40 min" class="editor-feature-card"></div>',
      "<h3>Payload bay</h3>",
      '<div data-type="feature-card" data-title="Modular mounts" class="editor-feature-card"></div>'
    ].join("");

    const result = prepareProductDescriptionToc(html);

    expect(result.entries).toEqual([
      { id: "flight-performance", label: "Flight performance", kind: "heading" },
      { id: "long-endurance", label: "Long endurance", kind: "feature" },
      { id: "payload-bay", label: "Payload bay", kind: "heading" },
      { id: "modular-mounts", label: "Modular mounts", kind: "feature" }
    ]);
    expect(result.html).toContain('id="flight-performance"');
    expect(result.html).toContain('id="long-endurance"');
    expect(result.html).toContain('id="payload-bay"');
    expect(result.html).toContain('id="modular-mounts"');
  });

  it("dedupes colliding ids", () => {
    const html = "<h2>Features</h2><h3>Features</h3>";
    const result = prepareProductDescriptionToc(html);
    expect(result.entries.map((entry) => entry.id)).toEqual(["features", "features-2"]);
  });

  it("returns empty entries for plain paragraphs", () => {
    const result = prepareProductDescriptionToc("<p>Just a paragraph.</p>");
    expect(result.entries).toEqual([]);
    expect(result.html).toBe("<p>Just a paragraph.</p>");
  });
});
