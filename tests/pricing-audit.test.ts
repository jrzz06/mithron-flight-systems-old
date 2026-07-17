import { describe, expect, it } from "vitest";
import type { WixProductSnapshot } from "@/lib/wix/catalog-client";
import {
  auditProductPricing,
  buildPricingPatch,
  buildWixPricingTarget,
  matchDbRowToWixPricing,
  buildWixPricingIndexes,
  type PricingAuditDbRow
} from "@/lib/product-migration/pricing-audit";

const wixFixture = (overrides: Partial<WixProductSnapshot> = {}): WixProductSnapshot => ({
  wix_product_id: "wix-abc-123",
  wix_slug: "15-inch-drone-frame",
  name: "15-inch Drone Frame",
  price: 1500,
  compare_at: 2000,
  currency: "INR",
  sku: "FRAME-15",
  cost_of_goods: 900,
  description_plain: "",
  source_url: "https://www.mithron.co/product-page/15-inch-drone-frame",
  source_catalog_id: "mithron-15-inch-drone-frame",
  source_fingerprint: "frame",
  category: "Accessories",
  media_urls: [],
  visible: true,
  updated_at: "2026-01-01T00:00:00.000Z",
  rich: {
    description_html: "",
    info_sections: [],
    seo: { title: "", description: "" },
    categories: ["Accessories"],
    variants: [],
    product_options: [],
    weight: "",
    sku: "FRAME-15",
    ribbon: "",
    media_urls: [],
    video_urls: [],
    document_urls: [],
    specs: {},
    technical_specs: {},
    features: [],
    story_chapters: [],
    semantic: {
      tagline: "",
      overview_html: "",
      overview_plain: "",
      features: [],
      highlight_specs: {},
      technical_specs: {},
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
});

const dbFixture = (overrides: Partial<PricingAuditDbRow> = {}): PricingAuditDbRow => ({
  slug: "source-15-inch-drone-frame",
  name: "15-inch Drone Frame",
  price: 1000,
  compare_at: null,
  on_sale: false,
  discount_type: null,
  discount_value: null,
  cost_of_goods: 500,
  source_currency: "INR",
  source_catalog_id: "mithron-15-inch-drone-frame",
  specs: { "Product ID": "wix-abc-123", SKU: "FRAME-15" },
  bundles: [{ id: "source-listing", price: 1000, compareAt: null }],
  is_visible: true,
  ...overrides
});

describe("pricing audit", () => {
  it("matches by Wix product ID first", () => {
    const wix = wixFixture();
    const indexes = buildWixPricingIndexes([wix]);
    const match = matchDbRowToWixPricing(dbFixture(), indexes);
    expect(match.status).toBe("matched");
    if (match.status === "matched") {
      expect(match.method).toBe("wix_product_id");
    }
  });

  it("flags ambiguous SKU matches for manual review", () => {
    const wixA = wixFixture({ wix_product_id: "a", wix_slug: "frame-a", sku: "DUP-SKU" });
    const wixB = wixFixture({ wix_product_id: "b", wix_slug: "frame-b", sku: "DUP-SKU" });
    const indexes = buildWixPricingIndexes([wixA, wixB]);
    const match = matchDbRowToWixPricing(
      dbFixture({ specs: { SKU: "DUP-SKU" }, source_catalog_id: "unknown" }),
      indexes
    );
    expect(match.status).toBe("manual_review");
  });

  it("builds pricing patch only for changed fields", () => {
    const wix = wixFixture();
    const target = buildWixPricingTarget(wix)!;
    const { patch, changes } = buildPricingPatch(dbFixture(), target);

    expect(patch.price).toBe(1500);
    expect(patch.compare_at).toBe(2000);
    expect(patch.on_sale).toBe(true);
    expect(patch.cost_of_goods).toBe(900);
    expect(changes.some((change) => change.field === "price")).toBe(true);
  });

  it("is idempotent when database already matches Wix", () => {
    const wix = wixFixture({ price: 1200, compare_at: null, cost_of_goods: null });
    const indexes = buildWixPricingIndexes([wix]);
    const row = dbFixture({
      price: 1200,
      compare_at: null,
      on_sale: false,
      discount_type: null,
      discount_value: null,
      cost_of_goods: 500,
      bundles: [{ id: "source-listing", price: 1200 }]
    });
    const entry = auditProductPricing(row, matchDbRowToWixPricing(row, indexes));
    expect(entry.action).toBe("skip_matched");
  });

  it("does not overwrite COGS when Wix does not provide it", () => {
    const wix = wixFixture({ cost_of_goods: null, price: 1200, compare_at: null });
    const target = buildWixPricingTarget(wix)!;
    const { patch } = buildPricingPatch(dbFixture({ price: 1000, cost_of_goods: 500 }), target);
    expect(patch.cost_of_goods).toBeUndefined();
    expect(patch.price).toBe(1200);
  });
});
