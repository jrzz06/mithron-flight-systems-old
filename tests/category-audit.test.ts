import { describe, expect, it } from "vitest";
import {
  auditProductCategory,
  matchDbRowToWixProduct,
  resolveCanonicalCategoryLabel
} from "@/lib/product-migration/category-audit";
import type { WixProductSnapshot } from "@/lib/wix/catalog-client";

const wixFixture = (overrides: Partial<WixProductSnapshot> = {}): WixProductSnapshot => ({
  wix_product_id: "wix-1",
  wix_slug: "15-inch-drone-frame",
  name: "15-inch Drone Frame",
  price: 1000,
  compare_at: null,
  currency: "INR",
  sku: null,
  cost_of_goods: null,
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
    sku: "",
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

describe("category-audit", () => {
  it("resolves canonical labels from taxonomy definitions", () => {
    expect(resolveCanonicalCategoryLabel("Agri Drones")).toBe("Agri Drones");
    expect(resolveCanonicalCategoryLabel("agriculture")).toBe("Agri Drones");
    expect(resolveCanonicalCategoryLabel("Global Products")).toBeNull();
  });

  it("uses trusted Wix category when slug aligns", () => {
    const wix = wixFixture();
    const row = {
      slug: "source-15-inch-drone-frame",
      name: "15-inch Drone Frame",
      category: "Agri Drones",
      source_catalog_id: wix.source_catalog_id,
      source_url: wix.source_url
    };
    const match = matchDbRowToWixProduct(row, [wix]);
    const audit = auditProductCategory(row, match);
    expect(audit.action).toBe("correct");
    expect(audit.expected_category).toBe("Accessories");
    expect(audit.resolution_source).toBe("metadata");
    expect(audit.reason).toBe("shelf_accessory_slug_override");
  });

  it("skips global products", () => {
    const audit = auditProductCategory(
      { slug: "global-1", name: "Global item", category: "Global Products" },
      null
    );
    expect(audit.action).toBe("skip_global");
  });
});
