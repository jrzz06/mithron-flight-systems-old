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
  /** Fields employees may edit in Homepage Builder. */
  employeeEditableFields: string[];
  /** Storefront concerns locked for employees. */
  employeeLockedFields: string[];
};

export const CMS_IMAGE_SPECS = {
  hero: {
    label: "Hero slide",
    requiredWidth: 2400,
    requiredHeight: 800,
    recommendedWidth: 2400,
    recommendedHeight: 800,
    minWidth: 1600,
    minHeight: 533,
    aspectRatio: "3:1",
    maxSizeMb: 2.5,
    formats: ["image/jpeg", "image/webp", "image/png"],
    exactDimensions: false,
    safeArea: "left-40"
  },
  miniCarousel: {
    label: "Mini carousel icon",
    requiredWidth: 300,
    requiredHeight: 300,
    recommendedWidth: 400,
    recommendedHeight: 400,
    minWidth: 300,
    minHeight: 300,
    aspectRatio: "1:1",
    maxSizeMb: 0.5,
    formats: ["image/jpeg", "image/png", "image/webp", "image/avif"]
  },
  shelfBanner: {
    label: "Product shelf banner",
    requiredWidth: 1920,
    requiredHeight: 650,
    recommendedWidth: 1920,
    recommendedHeight: 650,
    minWidth: 1920,
    minHeight: 650,
    aspectRatio: "3:1",
    maxSizeMb: 2,
    formats: ["image/jpeg", "image/png", "image/webp", "image/avif"]
  },
  interShelfBanner: {
    label: "Inter-shelf banner",
    requiredWidth: 1920,
    requiredHeight: 650,
    recommendedWidth: 1920,
    recommendedHeight: 650,
    minWidth: 1920,
    minHeight: 650,
    aspectRatio: "3:1",
    maxSizeMb: 2,
    formats: ["image/jpeg", "image/png", "image/webp", "image/avif"]
  },
  fullViewport: {
    label: "Full viewport banner (desktop)",
    requiredWidth: 1920,
    requiredHeight: 1080,
    recommendedWidth: 1920,
    recommendedHeight: 1080,
    minWidth: 1920,
    minHeight: 1080,
    aspectRatio: "16:9",
    maxSizeMb: 3,
    formats: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    exactDimensions: true
  },
  fullViewportMobile: {
    label: "Full viewport banner (mobile)",
    requiredWidth: 1080,
    requiredHeight: 1920,
    recommendedWidth: 1080,
    recommendedHeight: 1920,
    minWidth: 1080,
    minHeight: 1920,
    aspectRatio: "9:16",
    maxSizeMb: 3,
    formats: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    exactDimensions: true
  },
  relatedArticle: {
    label: "Related article cover",
    requiredWidth: 1600,
    requiredHeight: 1000,
    recommendedWidth: 1600,
    recommendedHeight: 1000,
    minWidth: 1050,
    minHeight: 700,
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
  },
  missionTileHero: {
    label: "Mission left hero card",
    requiredWidth: 1000,
    requiredHeight: 1000,
    recommendedWidth: 1200,
    recommendedHeight: 1200,
    minWidth: 1000,
    minHeight: 1000,
    aspectRatio: "1:1",
    maxSizeMb: 2,
    formats: ["image/jpeg", "image/png", "image/webp", "image/avif"]
  },
  missionTileWide: {
    label: "Mission right hero card",
    requiredWidth: 1800,
    requiredHeight: 820,
    recommendedWidth: 1800,
    recommendedHeight: 820,
    minWidth: 1800,
    minHeight: 820,
    aspectRatio: "2.2:1",
    maxSizeMb: 2,
    formats: ["image/jpeg", "image/png", "image/webp", "image/avif"]
  },
  missionTileSmall: {
    label: "Mission small card",
    requiredWidth: 900,
    requiredHeight: 600,
    recommendedWidth: 900,
    recommendedHeight: 600,
    minWidth: 900,
    minHeight: 600,
    aspectRatio: "3:2",
    maxSizeMb: 2,
    formats: ["image/jpeg", "image/png", "image/webp", "image/avif"]
  },
  testimonialAvatar: {
    label: "Testimonial avatar",
    requiredWidth: 200,
    requiredHeight: 200,
    recommendedWidth: 400,
    recommendedHeight: 400,
    minWidth: 200,
    minHeight: 200,
    aspectRatio: "1:1",
    maxSizeMb: 0.5,
    formats: ["image/jpeg", "image/png", "image/webp", "image/avif"]
  }
} satisfies Record<string, CmsImageSpec>;

/** Preview widths derived from app/globals.css --bp-phone-max / --bp-tablet-min / --bp-preserved-desktop-min. */
export const CMS_EDITOR_PREVIEW_BREAKPOINTS = {
  mobile: 390,
  tablet: 768,
  desktop: 1280
} as const;

/** Product card slots per shelf — matches storefront product-shelf-section slice(0, 4). */
export { SHELF_PRODUCT_CARD_SLOTS } from "@/config/homepage-shelf";

const LOCKED_LAYOUT = ["CSS", "layout", "fonts", "spacing", "section order", "animations"] as const;

function fieldsForEditorKind(editorKind: CmsEditorKind): Pick<HomepageSectionDefinition, "employeeEditableFields" | "employeeLockedFields"> {
  switch (editorKind) {
    case "hero-carousel":
      return {
        employeeEditableFields: ["headline", "subtitle", "CTA", "images"],
        employeeLockedFields: [...LOCKED_LAYOUT, "slide height", "carousel animation"]
      };
    case "mini-carousel":
      return {
        employeeEditableFields: ["product selection", "enabled"],
        employeeLockedFields: [...LOCKED_LAYOUT, "slide count"]
      };
    case "product-shelf":
      return {
        employeeEditableFields: ["shelf text", "banner image", "product dropdowns (4)"],
        employeeLockedFields: [...LOCKED_LAYOUT, "product price/image (catalog)"]
      };
    case "inter-shelf-banner":
    case "full-viewport-banner":
      return {
        employeeEditableFields: ["headline", "subtitle", "CTA", "images"],
        employeeLockedFields: [...LOCKED_LAYOUT, "alignment", "overlay"]
      };
    case "mission-world":
      return {
        employeeEditableFields: ["heading", "subtitle", "tile images", "buttons"],
        employeeLockedFields: [...LOCKED_LAYOUT, "bento tile count"]
      };
    case "reviews-section":
      return {
        employeeEditableFields: ["header copy", "testimonial cards", "avatar override", "product link", "display count"],
        employeeLockedFields: [...LOCKED_LAYOUT]
      };
    case "related-articles":
      return {
        employeeEditableFields: ["article cards", "poster image", "badge", "heading", "redirect URL", "CTA label"],
        employeeLockedFields: [...LOCKED_LAYOUT]
      };
    case "footer-view":
      return {
        employeeEditableFields: [],
        employeeLockedFields: [...LOCKED_LAYOUT, "edited in Global Footer CMS"]
      };
  }
}

function defineSection(
  partial: Omit<HomepageSectionDefinition, "employeeEditableFields" | "employeeLockedFields">
): HomepageSectionDefinition {
  return { ...partial, ...fieldsForEditorKind(partial.editorKind) };
}

export const homepageSectionRegistry: HomepageSectionDefinition[] = [
  defineSection({
    id: "hero",
    label: "Hero Carousel",
    description: "Edit slide headlines and replace hero images (1920×800). Layout stays locked.",
    sortOrder: 10,
    previewAnchor: "hero",
    editorKind: "hero-carousel",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "hero"
  }),
  defineSection({
    id: "mini-carousel",
    label: "Mini Carousel",
    description: "Switch mini-carousel products and copy. Slide count and layout stay locked.",
    sortOrder: 20,
    previewAnchor: "home-mini-carousel",
    editorKind: "mini-carousel",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "mini-carousel"
  }),
  defineSection({
    id: "shelf-drone-world",
    label: "Drone World shelf",
    description: "Edit shelf text, replace banner image, and switch product cards.",
    sortOrder: 30,
    previewAnchor: "drone-world",
    editorKind: "product-shelf",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "shelf-drone-world"
  }),
  defineSection({
    id: "banner-inter-shelf-1",
    label: "After Drone World",
    description: "Edit banner text and replace image. Alignment stays locked.",
    sortOrder: 40,
    previewAnchor: "banner-inter-shelf-1",
    editorKind: "inter-shelf-banner",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "banner-inter-shelf-1"
  }),
  defineSection({
    id: "shelf-drone-care",
    label: "Drone Care shelf",
    description: "Edit shelf text, replace banner image, and switch product cards.",
    sortOrder: 50,
    previewAnchor: "drone-care",
    editorKind: "product-shelf",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "shelf-drone-care"
  }),
  defineSection({
    id: "banner-inter-shelf-2",
    label: "After Drone Care",
    description: "Edit banner text and replace image. Alignment stays locked.",
    sortOrder: 60,
    previewAnchor: "banner-inter-shelf-2",
    editorKind: "inter-shelf-banner",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "banner-inter-shelf-2"
  }),
  defineSection({
    id: "shelf-global-products",
    label: "Global Products shelf",
    description: "Edit shelf text, replace banner image, and switch product cards.",
    sortOrder: 70,
    previewAnchor: "global-products",
    editorKind: "product-shelf",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "shelf-global-products"
  }),
  defineSection({
    id: "banner-inter-shelf-3",
    label: "After Global Products",
    description: "Edit banner text and replace image. Alignment stays locked.",
    sortOrder: 80,
    previewAnchor: "banner-inter-shelf-3",
    editorKind: "inter-shelf-banner",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "banner-inter-shelf-3"
  }),
  defineSection({
    id: "banner-full-viewport-1",
    label: "Full-screen banner A",
    description: "Edit text and replace desktop/mobile images (16:9 / 9:16). Layout stays locked.",
    sortOrder: 90,
    previewAnchor: "banner-full-viewport-1",
    editorKind: "full-viewport-banner",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "banner-full-viewport-1"
  }),
  defineSection({
    id: "banner-full-viewport-2",
    label: "Full-screen banner B",
    description: "Edit text and replace desktop/mobile images (16:9 / 9:16). Layout stays locked.",
    sortOrder: 100,
    previewAnchor: "banner-full-viewport-2",
    editorKind: "full-viewport-banner",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "banner-full-viewport-2"
  }),
  defineSection({
    id: "mission-agri",
    label: "Agri World",
    description: "Edit mission copy and tile images. Bento layout stays locked.",
    sortOrder: 110,
    previewAnchor: "agri-drones",
    editorKind: "mission-world",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "mission-agri"
  }),
  defineSection({
    id: "mission-city",
    label: "City World",
    description: "Edit mission copy and tile images. Bento layout stays locked.",
    sortOrder: 120,
    previewAnchor: "city-drones",
    editorKind: "mission-world",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "mission-city"
  }),
  defineSection({
    id: "testimonials",
    label: "Customer Testimonials",
    description: "Edit the homepage testimonials carousel — heading, cards, avatars, and linked products.",
    sortOrder: 130,
    previewAnchor: "home-client-testimonials",
    editorKind: "reviews-section",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "testimonials"
  }),
  defineSection({
    id: "related-articles",
    label: "Related Articles",
    description: "Edit up to three homepage blog/article cards — image, title, description, and redirect link.",
    sortOrder: 140,
    previewAnchor: "home-related-articles",
    editorKind: "related-articles",
    workflow: "draft-publish",
    editable: true,
    duplicateEnabled: false,
    visibilityKey: "related-articles"
  }),
  defineSection({
    id: "footer",
    label: "Footer",
    description: "View-only preview. Edit link columns in Global Footer CMS.",
    sortOrder: 150,
    previewAnchor: "home-about-footer",
    editorKind: "footer-view",
    workflow: "live-on-save",
    editable: false,
    duplicateEnabled: false,
    visibilityKey: "footer"
  })
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
    "shelf-drone-world": "Drone World shelf",
    "shelf-drone-care": "Drone Care shelf",
    "shelf-global-products": "Global Products shelf",
    "banner-inter-shelf-1": "After Drone World",
    "banner-inter-shelf-2": "After Drone Care",
    "banner-inter-shelf-3": "After Global Products",
    "banner-full-viewport-1": "Full-screen banner A",
    "banner-full-viewport-2": "Full-screen banner B",
    "mission-agri": "Agri World",
    "mission-city": "City World",
    testimonials: "Customer Testimonials",
    "related-articles": "Related Articles"
  };
  const definition = getHomepageSectionDefinition(sectionId);
  return labels[sectionId as HomepageSectionId] ?? definition?.label ?? String(sectionId);
}
