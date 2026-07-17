import { describe, expect, it } from "vitest";
import { extractRichProductContent } from "@/lib/wix/catalog-rich";
import { buildSafeMigrationPatch, auditProductMigration } from "@/lib/product-migration/field-audit";

describe("wix rich catalog extraction", () => {
  it("parses info sections into technical specs, features, and downloads", () => {
    const rich = extractRichProductContent(
      {
        infoSections: [
          {
            id: "specs",
            uniqueName: "specs",
            title: "Technical Specifications",
            plainDescription: "<table><tr><td>Flight Time</td><td>45 min</td></tr><tr><td>Range</td><td>15 km</td></tr></table>"
          },
          {
            id: "features",
            uniqueName: "features",
            title: "Features",
            plainDescription: "<ul><li>RTK positioning</li><li>Foldable arms</li></ul>"
          },
          {
            id: "downloads",
            uniqueName: "downloads",
            title: "Downloads",
            plainDescription: '<a href="https://example.com/manual.pdf">Product Manual</a>'
          }
        ]
      },
      "Agri Drones",
      ["https://static.wixstatic.com/media/hero.png"],
      { productName: "Survey Drone" }
    );

    expect(rich.technical_specs["Flight Time"]).toBe("45 min");
    expect(rich.features).toEqual([
      { title: "RTK positioning", body: "RTK positioning" },
      { title: "Foldable arms", body: "Foldable arms" }
    ]);
    expect(rich.document_urls[0]).toMatchObject({
      url: "https://example.com/manual.pdf",
      label: "Product Manual"
    });
  });

  it("keeps marketing feature titles intact in description parsing", () => {
    const rich = extractRichProductContent(
      {
        description:
          "<p>4K 20MP Camera: Professional imaging for mapping missions. 32 Minutes Flight Time: Extended sorties with dual batteries.</p>"
      },
      "Video Drones",
      [],
      { productName: "Mapping Drone" }
    );

    expect(rich.features.map((feature) => feature.title)).toEqual(["4K 20MP Camera", "32 Minutes Flight Time"]);
    expect(Object.keys(rich.technical_specs)).not.toContain("4K 20MP Camera");
  });
});

describe("safe migration patch", () => {
  it("fills only missing fields from Wix without overwriting valid Mithron data", () => {
    const wix = {
      wix_product_id: "p1",
      wix_slug: "test-drone",
      name: "Test Drone",
      price: 100000,
      compare_at: null,
      currency: "INR",
      sku: null,
      cost_of_goods: null,
      description_plain: "Long plain description from Wix with enough detail for procurement teams.",
      source_url: "https://www.mithron.co/product-page/test-drone",
      source_catalog_id: "mithron-test-drone",
      source_fingerprint: "testdrone",
      category: "Agri Drones",
      media_urls: ["https://static.wixstatic.com/media/a.png", "https://static.wixstatic.com/media/b.png"],
      visible: true,
      updated_at: "2026-06-24T00:00:00.000Z",
      rich: extractRichProductContent(
        {
          plainDescription: "Long plain description from Wix with enough detail for procurement teams.",
          infoSections: [{
            id: "specs",
            title: "Specifications",
            plainDescription: "<table><tr><td>Weight</td><td>2.1 kg</td></tr></table>"
          }]
        },
        "Agri Drones",
        ["https://static.wixstatic.com/media/a.png", "https://static.wixstatic.com/media/b.png"],
        { productName: "Test Drone" }
      )
    };

    const row = {
      slug: "test-drone",
      name: "Test Drone",
      description: "<p>Existing Mithron HTML description that should remain untouched.</p>",
      source_description: "Existing source description",
      specs: { "Flight Time": "30 min" },
      image: { src: "https://project.supabase.co/storage/v1/object/public/mithron-products/test.png" },
      gallery: [],
      story: [],
      bundles: [],
      variants: []
    };

    const patch = buildSafeMigrationPatch(row, wix);
    expect(patch.description).toBeUndefined();
    expect(patch.source_description).toBeUndefined();
    expect(patch.specs).toMatchObject({ "Flight Time": "30 min", Weight: "2.1 kg" });
    expect(patch.gallery).toBeUndefined();
    expect(patch.image).toBeUndefined();
    expect(patch.source_images).toBeUndefined();

    const audit = auditProductMigration(row, wix);
    expect(audit.matched).toBe(true);
    expect(audit.completeness_score).toBeGreaterThan(40);
  });

  it("reshapes polluted specs and story chapters when requested", () => {
    const wix = {
      wix_product_id: "p2",
      wix_slug: "polluted-drone",
      name: "Polluted Drone",
      price: 100000,
      compare_at: null,
      currency: "INR",
      sku: null,
      cost_of_goods: null,
      description_plain: "4K 20MP Camera: Professional imaging. Flight Time: 32 min",
      source_url: "https://www.mithron.co/product-page/polluted-drone",
      source_catalog_id: "mithron-polluted-drone",
      source_fingerprint: "polluteddrone",
      category: "Video Drones",
      media_urls: ["https://static.wixstatic.com/media/a.png"],
      visible: true,
      updated_at: "2026-06-24T00:00:00.000Z",
      rich: extractRichProductContent(
        {
          description: "<p>4K 20MP Camera: Professional imaging. Flight Time: 32 min</p>"
        },
        "Video Drones",
        ["https://static.wixstatic.com/media/a.png"],
        { productName: "Polluted Drone" }
      )
    };

    const row = {
      slug: "polluted-drone",
      name: "Polluted Drone",
      description: "<p>4K 20MP Camera: Professional imaging. Flight Time: 32 min</p>",
      specs: {
        "K 20MP Camera": "Broken legacy title",
        "Precise Navigation": "GPS/GLONASS, RTH function, IZI Sky Eye App support, 128 GB SD slot."
      },
      story: [{
        id: "wix-features",
        kicker: "Features",
        title: "Key features",
        body: "• Precise Navigation: GPS/GLONASS",
        media: { src: "", alt: "", kind: "image" as const },
        align: "left" as const
      }],
      gallery: [],
      bundles: [],
      variants: []
    };

    const patch = buildSafeMigrationPatch(row, wix, { reshapeContent: true });
    expect(patch.specs).toMatchObject({ "Flight Time": "32 min" });
    expect(patch.specs).not.toHaveProperty("K 20MP Camera");
    expect(patch.specs).not.toHaveProperty("Precise Navigation");
    expect((patch.story as Array<{ title: string }>).some((chapter) => chapter.title === "4K 20MP Camera")).toBe(true);
  });
});
