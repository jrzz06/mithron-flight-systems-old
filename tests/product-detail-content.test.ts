import { describe, expect, it } from "vitest";
import type { Product } from "@/config/types";
import {
  getCustomerFacingSpecs,
  getHighlightSpecs,
  getProductBuyBoxSummary,
  getProductDescriptionHtml,
  getProductOverviewHtml,
  getProductOverviewText,
  getStoryChapters
} from "@/lib/product-detail-content";
import { hydrateEditorAtomBlocks, renderSpecificationBlock } from "@/lib/editor/hydrate-rendered-content";

const baseProduct: Product = {
  slug: "demo-drone",
  productUrl: "/product/demo-drone",
  name: "Demo Drone",
  tagline: "Precision agriculture field system.",
  price: 1000,
  category: "Agri Drones",
  interests: ["agriculture"],
  image: { src: "/demo.png", alt: "Demo" },
  hero: { src: "/demo.png", alt: "Demo" },
  gallery: [],
  variants: [],
  bundles: [],
  story: [],
  specs: {
    Endurance: "28 min",
    Range: "1 km",
    Source: "hidden"
  },
  anchors: []
};

describe("product detail content", () => {
  it("surfaces customer-facing specs and highlight cards", () => {
    expect(getCustomerFacingSpecs(baseProduct).map(([key]) => key)).toEqual(["Endurance", "Range"]);
    expect(getHighlightSpecs(baseProduct)[0]).toEqual(["Endurance", "28 min"]);
  });

  it("prefers long seo copy for overview text", () => {
    const product = {
      ...baseProduct,
      seoDescription: "A long-form product overview with mission context and deployment guidance for operators."
    };
    expect(getProductOverviewText(product)).toContain("long-form product overview");
  });

  it("prefers full product description over clipped tagline", () => {
    const product = {
      ...baseProduct,
      tagline: "51 minutes (Single Battery), 102 KM FOV 90° Video...",
      description:
        "51 minutes (Single Battery), 102 KM FOV 90° Video transmission with professional aerial imaging workflow."
    };
    expect(getProductOverviewText(product)).toContain("Video transmission");
    expect(getProductOverviewText(product)).not.toMatch(/\.\.\.$/);
  });

  it("uses sourceDescription when cms description is missing", () => {
    const product = {
      ...baseProduct,
      sourceDescription: "Full Wix Studio product copy with deployment guidance for field operators."
    };
    expect(getProductOverviewText(product)).toContain("Full Wix Studio product copy");
  });

  it("renders spec-heavy html descriptions for the product page", () => {
    const product = {
      ...baseProduct,
      description:
        "<p>UAV Type: Hexacopter</p><p>UAV Category: Small</p><p>Endurance: 28 min</p><p>Range (LoS): 1 km</p>"
    };
    expect(getProductOverviewHtml(product)).toContain("UAV Type");
    expect(getProductOverviewText(product)).toContain("Endurance: 28 min");
  });

  it("returns full plain description for spec-heavy products", () => {
    const product = {
      ...baseProduct,
      tagline: "UAV Type: Hexacopter UAV Category: Small Endurance: 28 min Range (LoS): 1 km",
      description:
        "UAV Type: Hexacopter UAV Category: Small Endurance: 28 min Range (LoS): 1 km Maximum All-Up-Weight: 8.56 kg"
    };
    expect(getProductOverviewText(product)).toContain("Maximum All-Up-Weight: 8.56 kg");
  });

  it("returns sanitized cms html for product description display", () => {
    const product = {
      ...baseProduct,
      description: "<p>Built for <strong>precision agriculture</strong> missions.</p>"
    };
    const html = getProductDescriptionHtml(product);
    expect(html).toContain("<strong>precision agriculture</strong>");
  });

  it("preserves text color and background highlight on the storefront", () => {
    const product = {
      ...baseProduct,
      description:
        '<p>Pixy MR is available in the Global Products range. <span style="color:#ff0000;background-color:#ffff00;"><em><strong>one of the best product</strong></em></span></p>'
    };
    const html = getProductDescriptionHtml(product);
    expect(html).toMatch(/color:\s*#ff0000/i);
    expect(html).toMatch(/background-color:\s*#ffff00/i);
    expect(html).toContain("one of the best product");
  });

  it("falls back to sourceDescription only when description is empty", () => {
    const product = {
      ...baseProduct,
      sourceDescription: "Imported Wix copy with field deployment guidance."
    };
    const html = getProductDescriptionHtml(product);
    expect(html).toContain("Imported Wix copy");
  });

  it("does not fall back to seoDescription for product description display", () => {
    const product = {
      ...baseProduct,
      seoDescription: "SEO-only marketing copy should not appear on the product page."
    };
    expect(getProductDescriptionHtml(product)).toBeNull();
  });

  it("wraps plain text descriptions in paragraphs without changing words", () => {
    const product = {
      ...baseProduct,
      description: "First paragraph stays intact.\n\nSecond paragraph stays intact."
    };
    const html = getProductDescriptionHtml(product);
    expect(html).toContain("<p>First paragraph stays intact.</p>");
    expect(html).toContain("<p>Second paragraph stays intact.</p>");
  });

  it("prefers clean marketing copy for the buy box summary", () => {
    const product = {
      ...baseProduct,
      tagline: "Cinematic aerial storytelling.",
      description: "UAV Type: Hexacopter UAV Category: Small Endurance: 28 min"
    };
    expect(getProductBuyBoxSummary(product)).toBe("Cinematic aerial storytelling.");
  });

  it("does not invent buy box summary from highlight specs", () => {
    const product = {
      ...baseProduct,
      tagline: "UAV Type: Hexacopter UAV Category: Small Endurance: 28 min Range (LoS): 1 km",
      description: "UAV Type: Hexacopter"
    };
    expect(getProductBuyBoxSummary(product)).toBe("");
  });

  it("can skip fallback story when overview is rendered separately", () => {
    const product = {
      ...baseProduct,
      seoDescription: "Operator-ready overview for field deployment."
    };
    expect(getStoryChapters(product, { includeFallback: false })).toEqual([]);
    expect(getStoryChapters(product, { includeFallback: true })).toHaveLength(1);
  });
});

describe("editor rendered content hydration", () => {
  it("hydrates specification blocks from stored data-rows", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<div data-type="specification" class="editor-specification" data-rows=\'[{"label":"Camera","value":"Photo, Video@720p"}]\'></div>';
    hydrateEditorAtomBlocks(root);
    expect(root.querySelector(".editor-specification-label")?.textContent).toBe("Camera");
    expect(root.querySelector(".editor-specification-value")?.textContent).toBe("Photo, Video@720p");
  });

  it("renders specification rows markup", () => {
    const markup = renderSpecificationBlock([{ label: "GPIOs", value: "UART, I2C, SPI" }]);
    expect(markup).toContain("GPIOs");
    expect(markup).toContain("UART, I2C, SPI");
  });
});
