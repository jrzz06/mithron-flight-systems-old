import type { HomepageCmsSectionId } from "@/config/homepage-cms";

export type HomepageSectionId =
  | HomepageCmsSectionId
  | "mini-carousel"
  | "banner-inter-shelf-1"
  | "banner-inter-shelf-2"
  | "banner-inter-shelf-3"
  | "banner-full-viewport-1"
  | "banner-full-viewport-2"
  | "related-articles";

export type CmsEditorKind =
  | "hero-carousel"
  | "mini-carousel"
  | "product-shelf"
  | "inter-shelf-banner"
  | "full-viewport-banner"
  | "related-articles"
  | "mission-world"
  | "reviews-section"
  | "footer-view";

/** All editable homepage sections use draft → publish. `live-on-save` retained for footer (view-only). */
export type CmsSectionWorkflow = "draft-publish" | "live-with-draft" | "live-on-save";

export type CmsImageSpec = {
  label: string;
  requiredWidth: number;
  requiredHeight: number;
  recommendedWidth: number;
  recommendedHeight: number;
  minWidth: number;
  minHeight: number;
  aspectRatio: string;
  maxSizeMb: number;
  formats: string[];
  exactDimensions?: boolean;
  safeArea?: "left-40" | "center";
};

export type HomepageSectionDefinition = {
  id: HomepageSectionId;
  label: string;
  description: string;
  sortOrder: number;
  previewAnchor: string;
  editorKind: CmsEditorKind;
  workflow: CmsSectionWorkflow;
  editable: boolean;
  duplicateEnabled: boolean;
  visibilityKey: string;
};

export const CMS_IMAGE_SPECS = {
  hero: {
    label: "Hero slide",
    requiredWidth: 1920,
    requiredHeight: 800,
    recommendedWidth: 1920,
    recommendedHeight: 800,
    minWidth: 1920,
    minHeight: 800,
    aspectRatio: "2.4:1",
    maxSizeMb: 2.5,
    formats: ["image/jpeg", "image/webp"],
    exactDimensions: true,
    safeArea: "left-40"
  },
  miniCarousel: {
    label: "Mini carousel slide",
    requiredWidth: 1600,
    requiredHeight: 900,
    recommendedWidth: 1600,
    recommendedHeight: 900,
    minWidth: 960,
    minHeight: 540,
    aspectRatio: "16:9",
    maxSizeMb: 2,
    formats: ["image/jpeg", "image/png", "image/webp", "image/avif"]
  },
  shelfBanner: {
    label: "Product shelf banner",
    requiredWidth: 1600,
    requiredHeight: 600,
    recommendedWidth: 1600,
    recommendedHeight: 600,
    minWidth: 1200,
    minHeight: 450,
    aspectRatio: "8:3",
    maxSizeMb: 2,
    formats: ["image/jpeg", "image/png", "image/webp", "image/avif"]
  },
  interShelfBanner: {
    label: "Inter-shelf banner",
    requiredWidth: 1600,
    requiredHeight: 600,
    recommendedWidth: 1600,
    recommendedHeight: 600,
    minWidth: 1200,
    minHeight: 450,
    aspectRatio: "8:3",
    maxSizeMb: 2,
    formats: ["image/jpeg", "image/png", "image/webp", "image/avif"]
  },
  fullViewport: {
    label: "Full viewport banner",
    requiredWidth: 1920,
    requiredHeight: 1080,
    recommendedWidth: 1920,
    recommendedHeight: 1080,
    minWidth: 1280,
    minHeight: 720,
    aspectRatio: "16:9",
    maxSizeMb: 3,
    formats: ["image/jpeg", "image/png", "image/webp", "image/avif"]
  },
  relatedArticle: {
    label: "Related article cover",
    requiredWidth: 1600,
    requiredHeight: 1000,
    recommendedWidth: 1600,
    recommendedHeight: 1000,
    minWidth: 960,
    minHeight: 600,
    aspectRatio: "16:10",
    maxSizeMb: 2,
    formats: ["image/jpeg", "image/png", "image/webp", "image/avif"]
  },
  productCard: {
    label: "Product card",
    requiredWidth: 1000,
    requiredHeight: 1000,
    recommendedWidth: 1000,
    recommendedHeight: 1000,
    minWidth: 600,
    minHeight: 600,
    aspectRatio: "1:1",
    maxSizeMb: 2,
    formats: ["image/jpeg", "image/png", "image/webp", "image/avif"]
  }
} satisfies Record<string, CmsImageSpec>;

export const homepageSectionRegistry: HomepageSectionDefinition[] = [
  {
    id: "hero",
    label: "Hero Carousel",
    description: "Up to 3 homepage hero slides with headline, image, and primary CTA.",
    sortOrder: 10,
    previewAnchor: "hero",
    editorKind: "hero-carousel",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: true,
    visibilityKey: "hero"
  },
  {
    id: "mini-carousel",
    label: "Mini Carousel",
    description: "Compact product icon rail below the hero.",
    sortOrder: 20,
    previewAnchor: "home-mini-carousel",
    editorKind: "mini-carousel",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "mini-carousel"
  },
  {
    id: "shelf-drone-world",
    label: "Product Shelf 1",
    description: "Replace featured products shown on the homepage.",
    sortOrder: 30,
    previewAnchor: "drone-world",
    editorKind: "product-shelf",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: true,
    visibilityKey: "shelf-drone-world"
  },
  {
    id: "banner-inter-shelf-1",
    label: "Banner 1",
    description: "Promotional banner between shelves.",
    sortOrder: 40,
    previewAnchor: "banner-inter-shelf-1",
    editorKind: "inter-shelf-banner",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: true,
    visibilityKey: "banner-inter-shelf-1"
  },
  {
    id: "shelf-drone-care",
    label: "Product Shelf 2",
    description: "Replace care and accessories products on the homepage.",
    sortOrder: 50,
    previewAnchor: "drone-care",
    editorKind: "product-shelf",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: true,
    visibilityKey: "shelf-drone-care"
  },
  {
    id: "banner-inter-shelf-2",
    label: "Banner 2",
    description: "Promotional banner between shelves.",
    sortOrder: 60,
    previewAnchor: "banner-inter-shelf-2",
    editorKind: "inter-shelf-banner",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: true,
    visibilityKey: "banner-inter-shelf-2"
  },
  {
    id: "shelf-global-products",
    label: "Product Shelf 3",
    description: "Replace global catalog products on the homepage.",
    sortOrder: 70,
    previewAnchor: "global-products",
    editorKind: "product-shelf",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: true,
    visibilityKey: "shelf-global-products"
  },
  {
    id: "banner-inter-shelf-3",
    label: "Banner 3",
    description: "Promotional banner between shelves.",
    sortOrder: 80,
    previewAnchor: "banner-inter-shelf-3",
    editorKind: "inter-shelf-banner",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: true,
    visibilityKey: "banner-inter-shelf-3"
  },
  {
    id: "banner-full-viewport-1",
    label: "Full-screen Banner 1",
    description: "Full-screen campaign banner after the product shelves.",
    sortOrder: 90,
    previewAnchor: "banner-full-viewport-1",
    editorKind: "full-viewport-banner",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "banner-full-viewport-1"
  },
  {
    id: "banner-full-viewport-2",
    label: "Full-screen Banner 2",
    description: "Second full-screen campaign banner after the product shelves.",
    sortOrder: 100,
    previewAnchor: "banner-full-viewport-2",
    editorKind: "full-viewport-banner",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "banner-full-viewport-2"
  },
  {
    id: "mission-agri",
    label: "Agri World",
    description: "Agriculture mission story and tiles.",
    sortOrder: 110,
    previewAnchor: "agri-drones",
    editorKind: "mission-world",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "mission-agri"
  },
  {
    id: "mission-city",
    label: "City World",
    description: "Urban drone mission story and tiles.",
    sortOrder: 120,
    previewAnchor: "city-drones",
    editorKind: "mission-world",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "mission-city"
  },
  {
    id: "testimonials",
    label: "Reviews",
    description: "Customer reviews heading and carousel display settings.",
    sortOrder: 130,
    previewAnchor: "home-client-testimonials",
    editorKind: "reviews-section",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "testimonials"
  },
  {
    id: "related-articles",
    label: "Related Articles",
    description: "Three homepage article cards with custom images, copy, and links.",
    sortOrder: 140,
    previewAnchor: "home-related-articles",
    editorKind: "related-articles",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "related-articles"
  },
  {
    id: "footer",
    label: "Footer",
    description: "View-only preview. Edit link columns in advanced CMS.",
    sortOrder: 150,
    previewAnchor: "home-about-footer",
    editorKind: "footer-view",
    workflow: "live-on-save",
    editable: false,
    duplicateEnabled: false,
    visibilityKey: "footer"
  }
];

export function getHomepageSectionDefinition(sectionId: string) {
  return homepageSectionRegistry.find((section) => section.id === sectionId) ?? null;
}

export function shelfKeyFromSectionId(sectionId: HomepageSectionId) {
  if (sectionId === "shelf-drone-world") return "droneWorld" as const;
  if (sectionId === "shelf-drone-care") return "droneCare" as const;
  if (sectionId === "shelf-global-products") return "globalProducts" as const;
  return null;
}

export function missionKeyFromSectionId(sectionId: HomepageSectionId) {
  if (sectionId === "mission-agri") return "agri" as const;
  if (sectionId === "mission-city") return "city" as const;
  return null;
}

export function interShelfBannerIndex(sectionId: HomepageSectionId) {
  if (sectionId === "banner-inter-shelf-1") return 0;
  if (sectionId === "banner-inter-shelf-2") return 1;
  if (sectionId === "banner-inter-shelf-3") return 2;
  return null;
}

export function fullViewportBannerIndex(sectionId: HomepageSectionId) {
  if (sectionId === "banner-full-viewport-1") return 0;
  if (sectionId === "banner-full-viewport-2") return 1;
  return null;
}

export function sectionUsesProductPicker(editorKind: CmsEditorKind) {
  return editorKind === "product-shelf" || editorKind === "mini-carousel";
}

export function getBuilderSectionLabel(sectionId: HomepageSectionId | string) {
  const labels: Partial<Record<HomepageSectionId, string>> = {
    "shelf-drone-world": "Product Shelf 1",
    "shelf-drone-care": "Product Shelf 2",
    "shelf-global-products": "Product Shelf 3",
    "mission-agri": "Agri World",
    "mission-city": "City World",
    testimonials: "Reviews",
    "related-articles": "Related Articles"
  };
  const definition = getHomepageSectionDefinition(sectionId);
  return labels[sectionId as HomepageSectionId] ?? definition?.label ?? String(sectionId);
}
