export { SHELF_PRODUCT_CARD_SLOTS } from "@/config/homepage-shelf";

export type HomepageShelfCms = {
  eyebrow: string;
  title: string;
  href: string;
  viewAllLabel: string;
  heroEyebrow: string;
  heroSubtitle: string;
  heroBody: string;
  featureCta: string;
  heroCtaHref: string;
  heroImageSrc: string;
  heroImageAlt: string;
  productSlugs: string[];
  productCount: number;
};

export type HomepageMissionTileCms = {
  label: string;
  body: string;
  operator: string;
  model: string;
  location: string;
  imageSrc: string;
  imageAlt: string;
  href: string;
};

export type HomepageMissionCms = {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  mediaNote: string;
  tiles: HomepageMissionTileCms[];
};

export type HomepageCmsContent = {
  shelves: {
    droneWorld: HomepageShelfCms;
    droneCare: HomepageShelfCms;
    globalProducts: HomepageShelfCms;
  };
  missions: {
    agri: HomepageMissionCms;
    city: HomepageMissionCms;
  };
  testimonials: {
    eyebrow: string;
    title: string;
    titleAccent: string;
    lead: string;
    linkLabel: string;
    linkHref: string;
  };
  about: {
    eyebrow: string;
    title: string;
    body: string;
    primaryLabel: string;
    primaryHref: string;
    secondaryLabel: string;
    secondaryHref: string;
  };
};

export { getHomepageBaseCmsContent as getDefaultHomepageCmsContent } from "@/lib/home/homepage-resolution";

const MISSION_TILE_COUNT = 5;

function emptyMissionTile(): HomepageMissionTileCms {
  return {
    label: "",
    body: "",
    operator: "",
    model: "",
    location: "",
    imageSrc: "",
    imageAlt: "",
    href: ""
  };
}

function emptyShelf(): HomepageShelfCms {
  return {
    eyebrow: "",
    title: "",
    href: "",
    viewAllLabel: "",
    heroEyebrow: "",
    heroSubtitle: "",
    heroBody: "",
    featureCta: "",
    heroCtaHref: "",
    heroImageSrc: "",
    heroImageAlt: "",
    productSlugs: [],
    productCount: 5
  };
}

/** Strict-mode empty payload — no demo marketing copy. */
export const emptyHomepageCmsContent: HomepageCmsContent = {
  shelves: {
    droneWorld: emptyShelf(),
    droneCare: emptyShelf(),
    globalProducts: emptyShelf()
  },
  missions: {
    agri: {
      eyebrow: "",
      title: "",
      body: "",
      href: "",
      cta: "",
      mediaNote: "",
      tiles: Array.from({ length: MISSION_TILE_COUNT }, () => emptyMissionTile())
    },
    city: {
      eyebrow: "",
      title: "",
      body: "",
      href: "",
      cta: "",
      mediaNote: "",
      tiles: Array.from({ length: MISSION_TILE_COUNT }, () => emptyMissionTile())
    }
  },
  testimonials: {
    eyebrow: "",
    title: "",
    titleAccent: "",
    lead: "",
    linkLabel: "",
    linkHref: ""
  },
  about: {
    eyebrow: "",
    title: "",
    body: "",
    primaryLabel: "",
    primaryHref: "",
    secondaryLabel: "",
    secondaryHref: ""
  }
};

export type HomepageCmsSectionId =
  | "hero"
  | "shelf-drone-world"
  | "shelf-drone-care"
  | "shelf-global-products"
  | "mission-agri"
  | "mission-city"
  | "testimonials"
  | "footer";
