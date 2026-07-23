import { describe, expect, it } from "vitest";
import {
  assertPatchIsSafe,
  buildAllowedProductPatch
} from "@/lib/wix-content-migration/apply";
import {
  dedupeImagesByUrl,
  isValidHttpUrl
} from "@/lib/wix-content-migration/images";
import { matchProductForContentMigration } from "@/lib/wix-content-migration/match";
import {
  extractTableSpecs,
  htmlToTipTapDoc,
  overviewContainsHtmlTable,
  parseWixProductContent,
  sanitizeOverviewHtml,
  specificationsToRecord,
  stripHtmlTables
} from "@/lib/wix-content-migration/parse-content";
import { contentFingerprint } from "@/lib/wix-content-migration/paths";
import type { WixProductSnapshot } from "@/lib/wix/catalog-client";

function makeWixProduct(overrides: Partial<WixProductSnapshot> = {}): WixProductSnapshot {
  return {
    wix_product_id: "wix-1",
    wix_slug: "survey-drone",
    name: "Survey Drone",
    price: 100000,
    compare_at: null,
    currency: "INR",
    sku: "SKU-1",
    cost_of_goods: null,
    description_plain: "Reliable mapping drone for field teams.",
    source_url: "https://www.mithron.co/product-page/survey-drone",
    source_catalog_id: "mithron-survey-drone",
    source_fingerprint: "surveydrone",
    category: "Survey Drones",
    media_urls: [
      "https://static.wixstatic.com/media/a.png",
      "https://static.wixstatic.com/media/a.png",
      "https://static.wixstatic.com/media/b.png"
    ],
    visible: true,
    updated_at: "2026-07-22T00:00:00.000Z",
    rich: {
      description_html:
        "<p>Reliable mapping drone for field teams with RTK support.</p><table><tr><td>Flight Time</td><td>45 min</td></tr><tr><td>Range</td><td>15 km</td></tr></table><ul><li>Foldable arms</li></ul>",
      info_sections: [],
      seo: { title: "", description: "" },
      categories: ["Survey Drones"],
      variants: [],
      product_options: [],
      weight: "",
      sku: "SKU-1",
      ribbon: "",
      media_urls: ["https://static.wixstatic.com/media/a.png", "https://static.wixstatic.com/media/b.png"],
      video_urls: [],
      document_urls: [],
      specs: { "Flight Time": "45 min" },
      technical_specs: { Range: "15 km" },
      features: [],
      story_chapters: [],
      semantic: {
        overview_html: "<p>Reliable mapping drone for field teams with RTK support.</p><ul><li>Foldable arms</li></ul>",
        overview_plain: "Reliable mapping drone for field teams with RTK support.",
        tagline: "",
        features: [],
        highlight_specs: {},
        technical_specs: { "Flight Time": "45 min", Range: "15 km" },
        package_contents: [],
        warranty: "",
        disclaimers: [],
        applications: "",
        downloads: [],
        story_chapters: []
      },
      downloads_html: "",
      applications_html: "",
      included_items: [],
      faq_pairs: []
    },
    ...overrides
  };
}

describe("wix content migration parser", () => {
  it("separates overview from table specs and never keeps tables in overview", () => {
    const payload = parseWixProductContent(makeWixProduct());
    expect(overviewContainsHtmlTable(payload.overview)).toBe(false);
    expect(payload.overview).toContain("Reliable mapping drone");
    expect(payload.overview).toContain("<ul>");
    expect(payload.specifications).toEqual(
      expect.arrayContaining([
        { key: "Flight Time", value: "45 min" },
        { key: "Range", value: "15 km" }
      ])
    );
    expect(payload.overviewJson.type).toBe("doc");
    expect(payload.overviewJson.content?.length).toBeGreaterThan(0);
  });

  it("keeps the full Wix description instead of truncated semantic overview", () => {
    const longHtml = [
      "<p>Intro paragraph with enough operational detail for survey crews.</p>",
      "<ul>",
      "<li>Drone Type - Hexacopter</li>",
      "<li>Battery - 30,000 mAh</li>",
      "<li>Flight Time - Upto 5 Tanks / 5 Acres per Battery Charge</li>",
      "<li>Liquid Spray Tank - 10 litre</li>",
      "<li>Spray Swath width-4 m Seeds/Granules</li>",
      "<li>Spreader Tank-9 kg (Optional)</li>",
      "<li>Spreader Radius - 8 m to 10 m Max Speed</li>",
      "<li>Includes RTK, obstacle sensors, and training support notes.</li>",
      "</ul>",
      "<p>Closing note about DGCA compliance and field readiness.</p>"
    ].join("");

    const payload = parseWixProductContent(
      makeWixProduct({
        description_plain: "short plain",
        rich: {
          ...makeWixProduct().rich,
          description_html: longHtml,
          semantic: {
            ...makeWixProduct().rich.semantic,
            overview_html: "<p>Short truncated overview</p>",
            overview_plain: "Short truncated overview"
          }
        }
      })
    );

    expect(payload.overview.replace(/<[^>]+>/g, " ")).toContain("Intro paragraph");
    expect(payload.overview.replace(/<[^>]+>/g, " ")).toContain("Closing note");
    expect(payload.overview.replace(/<[^>]+>/g, " ").length).toBeGreaterThan(120);
    expect(payload.images.length).toBe(2);
  });

  it("preserves unicode symbols while stripping tables and inline styles", () => {
    const html = sanitizeOverviewHtml(
      '<p style="color:red">Δelta · 30,000 mAh · °C</p><table><tr><td>A</td><td>1</td></tr></table>'
    );
    expect(html).toContain("Δelta");
    expect(html).toContain("°C");
    expect(html).not.toContain("style=");
    expect(stripHtmlTables(html)).not.toMatch(/<table/i);
    expect(extractTableSpecs("<table><tr><td>Battery</td><td>30,000 mAh</td></tr></table>")).toEqual([
      { key: "Battery", value: "30,000 mAh" }
    ]);
  });

  it("converts headings, lists, and links into TipTap JSON", () => {
    const doc = htmlToTipTapDoc(
      '<h2>Overview</h2><p>See <a href="https://example.com/docs">docs</a>.</p><ul><li>One</li><li>Two</li></ul>'
    );
    expect(doc.content?.[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    expect(JSON.stringify(doc)).toContain("https://example.com/docs");
    expect(doc.content?.some((node) => node.type === "bulletList")).toBe(true);
  });
});

describe("wix content migration matcher", () => {
  it("matches by source_catalog_id first", () => {
    const wix = makeWixProduct();
    const result = matchProductForContentMigration(
      {
        slug: "source-other",
        name: "Different Name",
        source_catalog_id: "mithron-survey-drone"
      },
      [wix]
    );
    expect("wix" in result).toBe(true);
    if ("wix" in result) {
      expect(result.confidence).toBe("external_id");
      expect(result.wix.wix_slug).toBe("survey-drone");
    }
  });

  it("matches by SKU when external id is absent", () => {
    const wix = makeWixProduct({ sku: "SKU-UNIQUE-1", source_catalog_id: "mithron-other" });
    const result = matchProductForContentMigration(
      {
        slug: "unrelated-slug",
        name: "Different Name",
        specs: { "Product ID": "SKU-UNIQUE-1" }
      },
      [wix]
    );
    expect("wix" in result).toBe(true);
    if ("wix" in result) {
      expect(result.confidence).toBe("sku");
    }
  });

  it("skips ambiguous name-only matches", () => {
    const left = makeWixProduct({ wix_product_id: "1", wix_slug: "a", source_catalog_id: "mithron-a" });
    const right = makeWixProduct({ wix_product_id: "2", wix_slug: "b", source_catalog_id: "mithron-b" });
    const result = matchProductForContentMigration(
      { slug: "unrelated", name: "Survey Drone" },
      [left, right]
    );
    expect(result).toMatchObject({ error: "ambiguous_match" });
  });
});

describe("wix content migration safety + idempotency helpers", () => {
  it("rejects forbidden patch keys", () => {
    expect(() => assertPatchIsSafe({ price: 1 })).toThrow(/Forbidden fields/);
  });

  it("builds an allowlisted force-replace patch without price/category/slug", () => {
    const wix = makeWixProduct();
    const payload = parseWixProductContent(wix);
    const patch = buildAllowedProductPatch({
      wix,
      payload,
      hostedImages: [
        { url: "https://abc.supabase.co/storage/v1/object/public/mithron-products/a.jpg", alt: "Survey Drone", order: 0 },
        { url: "https://abc.supabase.co/storage/v1/object/public/mithron-products/b.jpg", alt: "Survey Drone", order: 1 }
      ]
    });

    expect(patch.description).toContain("Reliable mapping drone");
    expect(patch.specs?.["Flight Time"]).toBe("45 min");
    expect(patch.gallery).toHaveLength(2);
    expect(patch).not.toHaveProperty("workflow_status");
    expect(patch).not.toHaveProperty("price");
    expect(patch).not.toHaveProperty("slug");
    expect(patch).not.toHaveProperty("category");
  });

  it("can replace description without images and images without description", () => {
    const wix = makeWixProduct();
    const payload = parseWixProductContent(wix);

    const descriptionOnly = buildAllowedProductPatch({
      wix,
      payload,
      hostedImages: []
    });
    expect(descriptionOnly.description).toBeTruthy();
    expect(descriptionOnly.gallery).toBeUndefined();

    const imagesOnly = buildAllowedProductPatch({
      wix,
      payload: { ...payload, overview: "", overviewJson: { type: "doc", content: [{ type: "paragraph" }] } },
      hostedImages: [
        { url: "https://abc.supabase.co/storage/v1/object/public/mithron-products/a.jpg", alt: "Survey Drone", order: 0 }
      ]
    });
    expect(imagesOnly.gallery).toHaveLength(1);
    expect(imagesOnly.description).toBeUndefined();
  });

  it("dedupes images by url and validates http(s)", () => {
    const deduped = dedupeImagesByUrl([
      { url: "https://static.wixstatic.com/media/a.png", alt: "A", order: 0 },
      { url: "https://static.wixstatic.com/media/a.png/", alt: "A", order: 1 },
      { url: "https://static.wixstatic.com/media/b.png", alt: "B", order: 2 }
    ]);
    expect(deduped).toHaveLength(2);
    expect(deduped.map((item) => item.order)).toEqual([0, 1]);
    expect(isValidHttpUrl("https://example.com/x.png")).toBe(true);
    expect(isValidHttpUrl("ftp://example.com/x.png")).toBe(false);
  });

  it("upgrades resized Wix media URLs to originals", async () => {
    const { maximizeWixMediaUrl } = await import("@/lib/wix-content-migration/images");
    expect(
      maximizeWixMediaUrl(
        "https://static.wixstatic.com/media/abc~mv2.jpg/v1/fit/w_500,h_500/file.jpg"
      )
    ).toBe("https://static.wixstatic.com/media/abc~mv2.jpg");
  });

  it("keeps fingerprints stable for identical content and specs object conversion", () => {
    const specs = specificationsToRecord([
      { key: "Flight Time", value: "45 min" },
      { key: "Flight Time", value: "duplicate" }
    ]);
    expect(specs).toEqual({ "Flight Time": "45 min" });

    const left = contentFingerprint({
      wixProductId: "wix-1",
      overviewHtml: "<p>Hello</p>",
      specs: [{ key: "A", value: "1" }],
      imageUrls: ["https://a", "https://b"]
    });
    const right = contentFingerprint({
      wixProductId: "wix-1",
      overviewHtml: "<p>Hello</p>",
      specs: [{ key: "A", value: "1" }],
      imageUrls: ["https://a", "https://b"]
    });
    expect(left).toBe(right);
  });
});
