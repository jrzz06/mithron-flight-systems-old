import type { HomepageCmsContent, HomepageMissionCms, HomepageMissionTileCms, HomepageShelfCms } from "@/config/homepage-cms";
import { SHELF_PRODUCT_CARD_SLOTS } from "@/config/homepage-shelf";
import { homepageMediaFallbacks as localMedia } from "@/config/homepage-media-fallbacks";
import { storefrontMediaPaths } from "@/config/storefront-media-paths";
import type { Product } from "@/config/types";
import { getHomepageShelfCatalogHref } from "@/lib/catalog-categories";
import {
  isDroneCareShelfProduct,
  isDroneWorldCategory,
  isGlobalProductsCategory
} from "@/lib/product-shelf-classification";
import {
  buildShelfProductConfig,
  CMS_SHELF_KEY_TO_ID,
  resolveEffectiveShelfProducts,
  resolveEffectiveShelfSlugs,
  resolveEffectiveShelfSlotItemsPadded,
  type HomepageShelfId,
  type ProductShelfConfig
} from "@/lib/home/shelf-product-resolution";

export type ProofState = "VERIFIED" | "FALLBACK";
export type MediaState = "VERIFIED" | "FALLBACK";
export type LayoutKind = "ecosystem" | "care" | "catalog" | "agri-mission" | "city-mission";

export type ChapterMedia = {
  src: string;
  alt: string;
  caption: string;
  sourceState: ProofState;
};

export type HomeChapter = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  layoutKind: LayoutKind;
  media: ChapterMedia;
  productFilter: (product: Product) => boolean;
  proofState: ProofState;
  proof: string[];
};

export type MissionWorldTile = {
  label: string;
  body: string;
  href?: string;
  media: { src: string; alt: string };
  operator: string;
  model: string;
  location: string;
  size: "hero" | "wide" | "tall" | "standard";
};

export type MissionWorldConfig = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  testId: "agri-community-world" | "city-drone-world";
  composition: "agri-field" | "city-urban";
  mediaState: MediaState;
  mediaNote: string;
  tiles: MissionWorldTile[];
};

export type MissionWorldConfigs = Record<"agri-drones" | "city-drones", MissionWorldConfig>;
export type ShelfConfigs = Record<HomepageShelfId, ProductShelfConfig>;

function hasAny(product: Product, values: string[]) {
  const haystack = [
    product.name,
    product.tagline,
    product.category,
    ...product.interests,
    product.specs["Product ID"] ?? ""
  ].join(" ").toLowerCase();
  return values.some((value) => haystack.includes(value.toLowerCase()));
}

const droneWorldProductFilter = (product: Product) => isDroneWorldCategory(product);
const droneCareProductFilter = (product: Product) => isDroneCareShelfProduct(product);
const globalProductFilter = (product: Product) => isGlobalProductsCategory(product);

export const AGRONE_LINKS = {
  selectLogin: "https://drone.mithronsmart.com/selectlogin",
  platform: "https://drone.mithronsmart.com/"
} as const;

export type AgroneSelectLoginTarget = "Pilot" | "Drone Owner" | "FPO / Farmer" | "EMI";

export function buildAgroneSelectLoginHref(target: AgroneSelectLoginTarget): string {
  const url = new URL(AGRONE_LINKS.selectLogin);
  url.searchParams.set("target", target);
  return url.toString();
}

export const AGRONE_REGISTRATION_LINKS = {
  pilot: buildAgroneSelectLoginHref("Pilot"),
  droneOwner: buildAgroneSelectLoginHref("Drone Owner"),
  smartFarmer: buildAgroneSelectLoginHref("FPO / Farmer"),
  emi: buildAgroneSelectLoginHref("EMI"),
  platform: AGRONE_LINKS.platform
} as const;

export const homeChapters: HomeChapter[] = [
  {
    id: "drone-world",
    eyebrow: "Featured Collection",
    title: "Drone World",
    body: "Professional drones and aircraft from the Mithron store.",
    href: getHomepageShelfCatalogHref("drone-world"),
    cta: "View All",
    layoutKind: "ecosystem",
    media: localMedia.droneWorld,
    productFilter: droneWorldProductFilter,
    proofState: "VERIFIED",
    proof: ["Catalog products", "Product detail routes", "Published images"]
  },
  {
    id: "drone-care",
    eyebrow: "Essential Care",
    title: "Drone Care",
    body: "Batteries, propellers, controllers, filters, gimbals, and care accessories.",
    href: getHomepageShelfCatalogHref("drone-care"),
    cta: "View All",
    layoutKind: "care",
    media: localMedia.droneCare,
    productFilter: droneCareProductFilter,
    proofState: "VERIFIED",
    proof: ["Accessory catalog", "Care paths", "Product links"]
  },
  {
    id: "global-products",
    eyebrow: "Global Selection",
    title: "Global Product",
    body: "A broader selection of specialist products for comparison and purchase.",
    href: getHomepageShelfCatalogHref("global-products"),
    cta: "View All",
    layoutKind: "catalog",
    media: localMedia.globalProducts,
    productFilter: globalProductFilter,
    proofState: "VERIFIED",
    proof: ["Published product data", "Real product images", "Category routes"]
  },
  {
    id: "agri-drones",
    eyebrow: "Solutions for Growth",
    title: "Agri Community World",
    body: "Register, book, and finance drones across India's AGRONE network.",
    href: "/agriculture",
    cta: "Explore Agri Drones",
    layoutKind: "agri-mission",
    media: localMedia.agri,
    productFilter: (product) => hasAny(product, ["agri", "agriculture", "spray", "crop", "seed", "smart-farming", "mapping"]),
    proofState: "FALLBACK",
    proof: ["Representative mission gallery", "Existing Mithron media", "No customer deployment claims"]
  },
  {
    id: "city-drones",
    eyebrow: "Solutions for Future Cities",
    title: "City Drone World",
    body: "Urban platforms for rentals, training, care, and technician support.",
    href: "/surveillance",
    cta: "Explore City Drones",
    layoutKind: "city-mission",
    media: localMedia.city,
    productFilter: (product) => hasAny(product, ["surveillance", "inspection", "security", "delivery", "mapping", "thermal", "camera"]),
    proofState: "FALLBACK",
    proof: ["Representative mission gallery", "Existing Mithron media", "No municipal deployment claims"]
  }
];

export const missionWorldConfigs: MissionWorldConfigs = {
  "agri-drones": {
    id: "agri-drones",
    eyebrow: "Solutions for Growth",
    title: "Agri Community World",
    body: "Register, book, and finance drones across India's AGRONE network.",
    testId: "agri-community-world",
    composition: "agri-field",
    mediaState: "VERIFIED",
    mediaNote: "",
    tiles: [
      {
        label: "Drone owner registration",
        body: "Register your drone on the AGRONE network.",
        href: AGRONE_REGISTRATION_LINKS.droneOwner,
        media: localMedia.agroneDroneOwnerRegistration,
        operator: "AGRONE Network",
        model: "Drone owner network",
        location: "Pan-India",
        size: "tall"
      },
      {
        label: "Pilot Registration",
        body: "Join certified pilots and receive AGRONE bookings.",
        href: AGRONE_REGISTRATION_LINKS.pilot,
        media: localMedia.agronePilotRegistration,
        operator: "AGRONE Network",
        model: "AGRONE pilot network",
        location: "Pilot network",
        size: "hero"
      },
      {
        label: "AGRONE booking",
        body: "Book spraying and crop monitoring across India.",
        href: AGRONE_REGISTRATION_LINKS.platform,
        media: localMedia.agroneFarmerDroneBooking,
        operator: "AGRONE Network",
        model: "Nationwide booking",
        location: "Booking desk",
        size: "tall"
      },
      {
        label: "Farmer & FPO registration",
        body: "Access AGRONE services and on-demand drone support.",
        href: AGRONE_REGISTRATION_LINKS.smartFarmer,
        media: localMedia.agroneSmartFarmerRegistration,
        operator: "AGRONE Network",
        model: "Smart farmer program",
        location: "Farmer network",
        size: "wide"
      },
      {
        label: "Drones on EMI",
        body: "Check eligibility and compare financing plans.",
        href: AGRONE_REGISTRATION_LINKS.emi,
        media: localMedia.agroneAgriDroneLoanEmi,
        operator: "AGRONE Network",
        model: "Financing support",
        location: "Loan check",
        size: "standard"
      }
    ]
  },
  "city-drones": {
    id: "city-drones",
    eyebrow: "Solutions for Future Cities",
    title: "City Drone World",
    body: "Urban platforms for rentals, training, care, and technician support.",
    testId: "city-drone-world",
    composition: "city-urban",
    mediaState: "VERIFIED",
    mediaNote: "",
    tiles: [
      {
        label: "Dronelancer Model",
        body: "Pilot marketplace for on-demand city jobs.",
        media: localMedia.cityTrafficAnalytics,
        operator: "Mithron City Network",
        model: "Dronelancer network",
        location: "Pilot grid",
        size: "tall"
      },
      {
        label: "Drone Rental App",
        body: "Book rentals and track project earnings.",
        media: localMedia.citySmartMonitoring,
        operator: "Mithron City Network",
        model: "Rental services app",
        location: "Booking console",
        size: "hero"
      },
      {
        label: "Drone Academic",
        body: "Pilot training and certified urban flight programs.",
        media: localMedia.cityEmergencyResponse,
        operator: "Mithron Academy Network",
        model: "All drone academic",
        location: "Training hub",
        size: "tall"
      },
      {
        label: "FranchiseCare Center",
        body: "Local repair, spares, and maintenance support.",
        media: localMedia.cityInfrastructureInspection,
        operator: "Mithron Service Network",
        model: "FranchiseCare center",
        location: "Care workshop",
        size: "standard"
      },
      {
        label: "Technician Network",
        body: "Field diagnostics and maintenance coordination.",
        media: localMedia.cityCrowdMonitoring,
        operator: "Mithron Service Network",
        model: "Technician network",
        location: "Field network",
        size: "standard"
      }
    ]
  }
};

function missionTileToCms(tile: MissionWorldTile): HomepageMissionTileCms {
  return {
    label: tile.label,
    body: tile.body,
    operator: tile.operator,
    model: tile.model,
    location: tile.location,
    imageSrc: tile.media.src,
    imageAlt: tile.media.alt,
    href: tile.href ?? ""
  };
}

function shelfChapterToCms(chapter: HomeChapter, heroSrc: string, heroAlt: string): HomepageShelfCms {
  const shelfId = chapter.id as HomepageShelfId;
  return {
    eyebrow: chapter.eyebrow,
    title: chapter.title,
    href: getHomepageShelfCatalogHref(shelfId),
    viewAllLabel: chapter.cta,
    heroEyebrow: chapter.eyebrow,
    heroSubtitle: "",
    heroBody: chapter.body,
    featureCta: chapter.cta === "View All" ? "Shop products" : chapter.cta,
    heroCtaHref: getHomepageShelfCatalogHref(shelfId),
    heroImageSrc: heroSrc,
    heroImageAlt: heroAlt,
    productSlugs: [],
    productCount: 5
  };
}

/** Storefront base layer — what the live homepage shows when admin_settings fields are empty. */
export function getHomepageBaseCmsContent(): HomepageCmsContent {
  const droneWorld = homeChapters.find((chapter) => chapter.id === "drone-world")!;
  const droneCare = homeChapters.find((chapter) => chapter.id === "drone-care")!;
  const globalProducts = homeChapters.find((chapter) => chapter.id === "global-products")!;
  const agriChapter = homeChapters.find((chapter) => chapter.id === "agri-drones")!;
  const cityChapter = homeChapters.find((chapter) => chapter.id === "city-drones")!;
  const agriMission = missionWorldConfigs["agri-drones"];
  const cityMission = missionWorldConfigs["city-drones"];

  return {
    shelves: {
      droneWorld: shelfChapterToCms(droneWorld, storefrontMediaPaths.showcase.droneWorld, droneWorld.media.alt),
      droneCare: shelfChapterToCms(droneCare, storefrontMediaPaths.showcase.droneCare, droneCare.media.alt),
      globalProducts: shelfChapterToCms(
        globalProducts,
        storefrontMediaPaths.showcase.globalProducts,
        globalProducts.media.alt
      )
    },
    missions: {
      agri: {
        eyebrow: agriChapter.eyebrow,
        title: agriChapter.title,
        body: agriChapter.body,
        href: agriChapter.href,
        cta: agriChapter.cta,
        mediaNote: agriMission.mediaNote,
        tiles: agriMission.tiles.map(missionTileToCms)
      },
      city: {
        eyebrow: cityChapter.eyebrow,
        title: cityChapter.title,
        body: cityChapter.body,
        href: cityChapter.href,
        cta: cityChapter.cta,
        mediaNote: cityMission.mediaNote,
        tiles: cityMission.tiles.map(missionTileToCms)
      }
    },
    testimonials: {
      eyebrow: "Customer testimonials",
      title: "Customer Testimonial",
      titleAccent: "Testimonial",
      lead: "Hear Directly From Our Satisfified Partners",
      linkLabel: "",
      linkHref: ""
    },
    about: {
      eyebrow: "About us",
      title: "Drones for teams that work outdoors.",
      body: "Mithron builds and supplies agriculture, mapping, site monitoring, and media drones with Drone Care and setup support managed in one place.",
      primaryLabel: "About Mithron",
      primaryHref: "/about",
      secondaryLabel: "Contact team",
      secondaryHref: "/contact"
    }
  };
}

export function mergeMissionTiles(
  defaults: MissionWorldTile[],
  cmsTiles: HomepageMissionTileCms[]
): MissionWorldTile[] {
  return defaults.map((tile, index) => {
    const cmsTile = cmsTiles[index];
    if (!cmsTile) return tile;
    return {
      ...tile,
      label: cmsTile.label || tile.label,
      body: cmsTile.body || tile.body,
      operator: cmsTile.operator || tile.operator,
      model: cmsTile.model || tile.model,
      location: cmsTile.location || tile.location,
      href: cmsTile.href?.trim() || tile.href,
      media: {
        src: cmsTile.imageSrc || tile.media.src,
        alt: cmsTile.imageAlt || tile.media.alt
      }
    };
  });
}

export function resolveMissionConfigs(cms: HomepageCmsContent): MissionWorldConfigs {
  return {
    "agri-drones": {
      ...missionWorldConfigs["agri-drones"],
      eyebrow: cms.missions.agri.eyebrow || missionWorldConfigs["agri-drones"].eyebrow,
      title: cms.missions.agri.title || missionWorldConfigs["agri-drones"].title,
      body: cms.missions.agri.body || missionWorldConfigs["agri-drones"].body,
      mediaNote: cms.missions.agri.mediaNote,
      tiles: mergeMissionTiles(missionWorldConfigs["agri-drones"].tiles, cms.missions.agri.tiles)
    },
    "city-drones": {
      ...missionWorldConfigs["city-drones"],
      eyebrow: cms.missions.city.eyebrow || missionWorldConfigs["city-drones"].eyebrow,
      title: cms.missions.city.title || missionWorldConfigs["city-drones"].title,
      body: cms.missions.city.body || missionWorldConfigs["city-drones"].body,
      mediaNote: cms.missions.city.mediaNote,
      tiles: mergeMissionTiles(missionWorldConfigs["city-drones"].tiles, cms.missions.city.tiles)
    }
  };
}

export function resolveShelfConfigs(cms: HomepageCmsContent): ShelfConfigs {
  return {
    "drone-world": buildShelfProductConfig("drone-world", cms.shelves.droneWorld),
    "drone-care": buildShelfProductConfig("drone-care", cms.shelves.droneCare),
    "global-products": buildShelfProductConfig("global-products", cms.shelves.globalProducts)
  };
}

export function resolveLandingChapters(cms: HomepageCmsContent): HomeChapter[] {
  return homeChapters.map((chapter) => {
    if (chapter.id === "drone-world") {
      return {
        ...chapter,
        href: getHomepageShelfCatalogHref("drone-world"),
        media: {
          ...chapter.media,
          src: cms.shelves.droneWorld.heroImageSrc || chapter.media.src,
          alt: cms.shelves.droneWorld.heroImageAlt || chapter.media.alt
        }
      };
    }
    if (chapter.id === "drone-care") {
      return {
        ...chapter,
        href: getHomepageShelfCatalogHref("drone-care"),
        media: {
          ...chapter.media,
          src: cms.shelves.droneCare.heroImageSrc || chapter.media.src,
          alt: cms.shelves.droneCare.heroImageAlt || chapter.media.alt
        }
      };
    }
    if (chapter.id === "global-products") {
      return {
        ...chapter,
        href: getHomepageShelfCatalogHref("global-products"),
        media: {
          ...chapter.media,
          src: cms.shelves.globalProducts.heroImageSrc || chapter.media.src,
          alt: cms.shelves.globalProducts.heroImageAlt || chapter.media.alt
        }
      };
    }
    if (chapter.id === "agri-drones") {
      return {
        ...chapter,
        eyebrow: cms.missions.agri.eyebrow || chapter.eyebrow,
        title: cms.missions.agri.title || chapter.title,
        body: cms.missions.agri.body || chapter.body,
        href: cms.missions.agri.href || chapter.href,
        cta: cms.missions.agri.cta || chapter.cta
      };
    }
    if (chapter.id === "city-drones") {
      return {
        ...chapter,
        eyebrow: cms.missions.city.eyebrow || chapter.eyebrow,
        title: cms.missions.city.title || chapter.title,
        body: cms.missions.city.body || chapter.body,
        href: cms.missions.city.href || chapter.href,
        cta: cms.missions.city.cta || chapter.cta
      };
    }
    return chapter;
  });
}

export type HomepageLandingState = {
  shelfConfigs: ShelfConfigs;
  missionConfigs: MissionWorldConfigs;
  landingChapters: HomeChapter[];
  chapterById: Record<string, HomeChapter>;
};

export function resolveHomepageLandingState(cms: HomepageCmsContent): HomepageLandingState {
  const landingChapters = resolveLandingChapters(cms);
  return {
    shelfConfigs: resolveShelfConfigs(cms),
    missionConfigs: resolveMissionConfigs(cms),
    landingChapters,
    chapterById: Object.fromEntries(landingChapters.map((chapter) => [chapter.id, chapter]))
  };
}

export type ShelfEditorState = {
  shelf: HomepageShelfCms;
  config: ProductShelfConfig;
  chapter: HomeChapter;
  effectiveSlugs: string[];
  effectiveProducts: Product[];
  slotItems: ReturnType<typeof resolveEffectiveShelfSlotItemsPadded>;
};

export function resolveShelfEditorState(
  shelfKey: keyof HomepageCmsContent["shelves"],
  cms: HomepageCmsContent,
  products: Product[],
  draftSlugs?: string[]
): ShelfEditorState {
  const shelfId = CMS_SHELF_KEY_TO_ID[shelfKey];
  const landing = resolveHomepageLandingState(cms);
  const chapter = landing.chapterById[shelfId];
  const shelfForResolve = draftSlugs?.some(Boolean)
    ? { ...cms.shelves[shelfKey], productSlugs: draftSlugs.filter(Boolean) }
    : cms.shelves[shelfKey];
  const config = buildShelfProductConfig(shelfId, shelfForResolve);
  const effectiveSlugs = resolveEffectiveShelfSlugs(shelfId, shelfForResolve, products, SHELF_PRODUCT_CARD_SLOTS);
  const effectiveProducts = resolveEffectiveShelfProducts(shelfId, shelfForResolve, products, SHELF_PRODUCT_CARD_SLOTS);
  const slotItems = resolveEffectiveShelfSlotItemsPadded(shelfId, shelfForResolve, products, SHELF_PRODUCT_CARD_SLOTS);

  return {
    shelf: shelfForResolve,
    config,
    chapter,
    effectiveSlugs,
    effectiveProducts,
    slotItems
  };
}

export type MissionEditorState = {
  mission: HomepageMissionCms;
  config: MissionWorldConfig;
  chapter: HomeChapter;
};

export function resolveMissionEditorState(
  missionKey: keyof HomepageCmsContent["missions"],
  cms: HomepageCmsContent
): MissionEditorState {
  const missionId = missionKey === "agri" ? "agri-drones" : "city-drones";
  const landing = resolveHomepageLandingState(cms);
  return {
    mission: cms.missions[missionKey],
    config: landing.missionConfigs[missionId],
    chapter: landing.chapterById[missionId]
  };
}

/** Merge stored admin_settings homepage v1 with storefront base layer (single source of truth). */
export function resolveEffectiveHomepageCmsContent(stored: unknown): HomepageCmsContent {
  const base = getHomepageBaseCmsContent();
  const root = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const shelves = root.shelves && typeof root.shelves === "object" ? (root.shelves as Record<string, unknown>) : {};
  const missions = root.missions && typeof root.missions === "object" ? (root.missions as Record<string, unknown>) : {};
  const testimonials = root.testimonials && typeof root.testimonials === "object" ? (root.testimonials as Record<string, unknown>) : {};
  const about = root.about && typeof root.about === "object" ? (root.about as Record<string, unknown>) : {};

  const mergeShelf = (key: keyof HomepageCmsContent["shelves"], partial: unknown): HomepageShelfCms => {
    const row = partial && typeof partial === "object" ? (partial as Record<string, unknown>) : {};
    const fallback = base.shelves[key];
    const str = (field: string) => (typeof row[field] === "string" ? row[field] as string : undefined);
    return {
      eyebrow: str("eyebrow") ?? fallback.eyebrow,
      title: str("title") ?? fallback.title,
      href: str("href") ?? fallback.href,
      viewAllLabel: str("viewAllLabel") ?? fallback.viewAllLabel,
      heroEyebrow: str("heroEyebrow") ?? fallback.heroEyebrow,
      heroSubtitle: str("heroSubtitle") ?? fallback.heroSubtitle,
      heroBody: str("heroBody") ?? fallback.heroBody,
      featureCta: str("featureCta") ?? fallback.featureCta,
      heroCtaHref: str("heroCtaHref") ?? fallback.heroCtaHref,
      heroImageSrc: str("heroImageSrc") ?? fallback.heroImageSrc,
      heroImageAlt: str("heroImageAlt") ?? fallback.heroImageAlt,
      productSlugs: Array.isArray(row.productSlugs)
        ? row.productSlugs.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : fallback.productSlugs,
      productCount: typeof row.productCount === "number" && row.productCount > 0
        ? Math.min(12, Math.trunc(row.productCount))
        : fallback.productCount
    };
  };

  const mergeMission = (key: keyof HomepageCmsContent["missions"], partial: unknown): HomepageMissionCms => {
    const row = partial && typeof partial === "object" ? (partial as Record<string, unknown>) : {};
    const fallback = base.missions[key];
    const str = (field: string) => (typeof row[field] === "string" ? row[field] as string : undefined);
    const tilePartials = Array.isArray(row.tiles) ? row.tiles : [];
    return {
      eyebrow: str("eyebrow") ?? fallback.eyebrow,
      title: str("title") ?? fallback.title,
      body: str("body") ?? fallback.body,
      href: str("href") ?? fallback.href,
      cta: str("cta") ?? fallback.cta,
      mediaNote: str("mediaNote") ?? fallback.mediaNote,
      tiles: fallback.tiles.map((tile, index) => {
        const cmsTile = tilePartials[index];
        if (!cmsTile || typeof cmsTile !== "object") return tile;
        const t = cmsTile as Record<string, unknown>;
        const tileStr = (field: string) => (typeof t[field] === "string" ? t[field] as string : undefined);
        return {
          label: tileStr("label") ?? tile.label,
          body: tileStr("body") ?? tile.body,
          operator: tileStr("operator") ?? tile.operator,
          model: tileStr("model") ?? tile.model,
          location: tileStr("location") ?? tile.location,
          imageSrc: tileStr("imageSrc") ?? tile.imageSrc,
          imageAlt: tileStr("imageAlt") ?? tile.imageAlt,
          href: tileStr("href") ?? tile.href
        };
      })
    };
  };

  const sanitizeTestimonialsTitle = (title: string, fallback: string) => {
    const normalized = title.replace(/\bjerus\b/gi, "fleet").trim();
    if (/what customers say about our/i.test(normalized)) return fallback;
    if (/^what our clients say$/i.test(normalized)) return fallback;
    return normalized || fallback;
  };

  const sanitizeTestimonialsAccent = (titleAccent: string, fallback: string) => {
    const normalized = titleAccent.trim();
    if (/^our clients$/i.test(normalized)) return fallback;
    return normalized || fallback;
  };

  const normalizeTestimonialsHeader = (input: {
    eyebrow: string;
    title: string;
    titleAccent: string;
    lead: string;
    linkLabel: string;
    linkHref: string;
  }) => {
    const eyebrowRaw = input.eyebrow.trim();
    const titleRaw = input.title.trim();
    const leadRaw = input.lead.trim();
    const accentRaw = input.titleAccent.trim();

    const isLegacyEyebrow = /^customer voices$/i.test(eyebrowRaw);
    const isLegacyTitle =
      /^trusted by pilots and field teams$/i.test(titleRaw) ||
      /^customer testimonials$/i.test(titleRaw) ||
      /^what our clients say$/i.test(titleRaw);
    const isLegacyAccent = /^our clients$/i.test(accentRaw);
    const isLegacyLead =
      /^real feedback from operators running agriculture, mapping, and surveillance missions with mithron hardware\.$/i.test(leadRaw) ||
      /^hear directly our satisfified partners$/i.test(leadRaw);

    if (isLegacyEyebrow || isLegacyTitle || isLegacyAccent || isLegacyLead) {
      return {
        eyebrow: base.testimonials.eyebrow,
        title: base.testimonials.title,
        titleAccent: base.testimonials.titleAccent,
        lead: base.testimonials.lead,
        linkLabel: "",
        linkHref: ""
      };
    }

    return input;
  };

  const resolvedTestimonials = normalizeTestimonialsHeader({
    eyebrow: typeof testimonials.eyebrow === "string" ? testimonials.eyebrow : base.testimonials.eyebrow,
    title: sanitizeTestimonialsTitle(
      typeof testimonials.title === "string" ? testimonials.title : "",
      base.testimonials.title
    ),
    titleAccent: sanitizeTestimonialsAccent(
      typeof testimonials.titleAccent === "string" ? testimonials.titleAccent : "",
      base.testimonials.titleAccent
    ),
    lead: typeof testimonials.lead === "string" ? testimonials.lead : base.testimonials.lead,
    linkLabel: typeof testimonials.linkLabel === "string" ? testimonials.linkLabel : base.testimonials.linkLabel,
    linkHref: typeof testimonials.linkHref === "string" ? testimonials.linkHref : base.testimonials.linkHref
  });

  return {
    shelves: {
      droneWorld: mergeShelf("droneWorld", shelves.droneWorld),
      droneCare: mergeShelf("droneCare", shelves.droneCare),
      globalProducts: mergeShelf("globalProducts", shelves.globalProducts)
    },
    missions: {
      agri: mergeMission("agri", missions.agri),
      city: mergeMission("city", missions.city)
    },
    testimonials: resolvedTestimonials,
    about: {
      eyebrow: typeof about.eyebrow === "string" ? about.eyebrow : base.about.eyebrow,
      title: typeof about.title === "string" ? about.title : base.about.title,
      body: typeof about.body === "string" ? about.body : base.about.body,
      primaryLabel: typeof about.primaryLabel === "string" ? about.primaryLabel : base.about.primaryLabel,
      primaryHref: typeof about.primaryHref === "string" ? about.primaryHref : base.about.primaryHref,
      secondaryLabel: typeof about.secondaryLabel === "string" ? about.secondaryLabel : base.about.secondaryLabel,
      secondaryHref: typeof about.secondaryHref === "string" ? about.secondaryHref : base.about.secondaryHref
    }
  };
}
