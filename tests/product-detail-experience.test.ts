import { describe, expect, it } from "vitest";
import type { Product } from "@/config/types";
import {
  buildProductDetailExperience,
  buildProductMediaPlan,
  buildProductNarrative
} from "@/lib/product-detail-experience";

const baseProduct: Product = {
  slug: "demo-drone",
  productUrl: "/product/demo-drone",
  name: "Demo Drone",
  tagline: "Precision agriculture field system.",
  price: 1000,
  category: "Agri Drones",
  interests: ["agriculture"],
  image: { src: "/image-a.png", alt: "Front" },
  hero: { src: "/image-a.png", alt: "Hero duplicate" },
  gallery: [
    { src: "/image-b.png", alt: "Angle" },
    { src: "/image-c.png", alt: "Detail" }
  ],
  variants: [],
  bundles: [{ id: "standard", name: "Standard", price: 1000, description: "Kit", includes: ["Drone", "Battery"] }],
  story: [
    {
      id: "feature-1",
      kicker: "Features",
      title: "Long endurance",
      body: "Extended flight time for large plots.",
      media: { src: "/story-feature.png", alt: "Feature" }
    },
    {
      id: "story-1",
      kicker: "Mission",
      title: "Built for the field",
      body: "Unique mission narrative copy.",
      media: { src: "/story-mission.png", alt: "Mission" }
    }
  ],
  specs: {
    Endurance: "28 min",
    Range: "1 km",
    Payload: "10 L"
  },
  anchors: []
};

describe("product detail experience", () => {
  it("deduplicates hero gallery media by src", () => {
    const plan = buildProductMediaPlan(baseProduct);
    const srcs = plan.map((item) => item.src);
    expect(srcs).toEqual(["/image-a.png", "/image-b.png", "/image-c.png"]);
  });

  it("prefers catalog cutout display src when responsive fallback is available", () => {
    const cutoutSrc = "https://example.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/demo-drone.webp";
    const rawSrc = "https://example.supabase.co/storage/v1/object/public/mithron-products/products/demo-drone/raw.png";
    const plan = buildProductMediaPlan({
      ...baseProduct,
      image: {
        src: rawSrc,
        alt: "Raw upload",
        responsive: {
          assetId: "demo",
          bucket: "mithron-products",
          assetRole: "product",
          category: "product",
          generatedPromptId: "demo",
          status: "generated",
          fallbackSrc: cutoutSrc,
          fallbackAlt: "Cutout",
          width: 1200,
          height: 900,
          dominantColor: "#fff",
          variants: { webp: [] }
        }
      },
      hero: { src: rawSrc, alt: "Raw upload" },
      gallery: []
    });

    expect(plan[0]?.src).toBe(cutoutSrc);
    expect(plan[0]?.alt).toBe("Cutout");
  });

  it("keeps overview copy out of narrative chapters", () => {
    const product = {
      ...baseProduct,
      seoDescription: "A long-form product overview with mission context and deployment guidance for operators."
    };
    const experience = buildProductDetailExperience(product, []);
    expect(experience.overviewText).toContain("long-form product overview");
    expect(experience.narrative.every((chapter) => !chapter.body.includes("long-form product overview"))).toBe(true);
  });

  it("assigns unique media across hero and story sections when possible", () => {
    const experience = buildProductDetailExperience(baseProduct, []);
    const heroSrcs = experience.mediaPlan.map((item) => item.src);
    const storySrcs = [
      ...experience.features.map((item) => item.media?.src),
      ...experience.narrative.map((item) => item.media?.src)
    ].filter(Boolean);
    const overlap = storySrcs.filter((src) => heroSrcs.includes(src!));
    expect(overlap.length).toBeLessThanOrEqual(1);
  });

  it("builds grouped specs and comparison rails", () => {
    const experience = buildProductDetailExperience(baseProduct, [
      {
        slug: "other-drone",
        name: "Other Drone",
        tagline: "Alternative",
        price: 1200,
        category: "Agri Drones",
        interests: ["agriculture"],
        image: { src: "/other.png", alt: "Other" },
        searchText: "other"
      }
    ]);
    expect(experience.specGroups.length).toBeGreaterThan(0);
    expect(experience.comparison?.columns).toHaveLength(2);
    expect(experience.inTheBox).toHaveLength(2);
    expect(experience.relatedRails.similar).toHaveLength(1);
  });

  it("suppresses narrative chapters that repeat overview body", () => {
    const overview = "Shared overview copy for the product page.";
    const chapters = buildProductNarrative(
      {
        ...baseProduct,
        story: [
          {
            id: "dup",
            kicker: "Mission",
            title: "Overview repeat",
            body: overview,
            media: { src: "/dup.png", alt: "Dup" }
          }
        ]
      },
      overview,
      new Set(["/image-a.png", "/image-b.png", "/image-c.png"]),
      []
    );
    expect(chapters).toHaveLength(0);
  });
});
