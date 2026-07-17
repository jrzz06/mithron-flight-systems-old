import { catalogShowcaseAssets, heroAssets } from "@/config/assets";
import { resolveCategoryNavbarInkByCmsRouteKey } from "@/config/navbar-ink-registry";

export const catalogShowcaseFrame = {
  width: 1915,
  height: 821
} as const;

/** Unified cinematic category banner frame — matches agriculture showcase proportions. */
export const catalogCinematicBannerFrame = {
  width: 1834,
  height: 858,
  mobileAspectRatio: "1.55 / 1",
  mobileObjectPosition: "center center"
} as const;

type CatalogRouteConfig = {
  title: string;
  subtitle: string;
  heroImage: string;
  showcaseImage?: {
    src: string;
    alt: string;
    width: number;
    height: number;
    navbarInk: "light" | "dark";
    fit?: "cinematic" | "native";
    mobileAspectRatio?: string;
    mobileObjectPosition?: string;
  };
};

export const catalogRoutes = {
  agriculture: {
    title: "Agri drones",
    subtitle: "Precision spraying, seeding, crop monitoring, and farm automation solutions for modern agriculture teams.",
    heroImage: heroAssets.ag10Command,
    showcaseImage: {
      src: catalogShowcaseAssets.agricultureCategory,
      alt: "Agri drone cinematic category showcase",
      width: 1834,
      height: 858,
      navbarInk: resolveCategoryNavbarInkByCmsRouteKey("agriculture") ?? "light",
      mobileAspectRatio: "1.55 / 1",
      mobileObjectPosition: "center center"
    }
  },
  videoDrones: {
    title: "Video drones",
    subtitle: "Compact aerial imaging, field documentation, and creator-ready drones for training and visual work.",
    heroImage: heroAssets.mappingFlight,
    showcaseImage: {
      src: catalogShowcaseAssets.videoDronesCategory,
      alt: "Video drone cinematic category showcase",
      width: 1672,
      height: 941,
      navbarInk: resolveCategoryNavbarInkByCmsRouteKey("videoDrones") ?? "light",
      mobileAspectRatio: "1.55 / 1",
      mobileObjectPosition: "center center"
    }
  },
  creativeDrones: {
    title: "Creative drones",
    subtitle: "Drone soccer, academics, training labs, and creative aerospace programs for hands-on flight learning.",
    heroImage: heroAssets.securityGrid,
    showcaseImage: {
      src: catalogShowcaseAssets.creativeDronesCategory,
      alt: "Creative drone cinematic category showcase",
      width: 1915,
      height: 821,
      navbarInk: resolveCategoryNavbarInkByCmsRouteKey("creativeDrones") ?? "light",
      mobileAspectRatio: "1.55 / 1",
      mobileObjectPosition: "center center"
    }
  },
  accessories: {
    title: "All drones and spares",
    subtitle: "Controllers, payloads, batteries, propellers, and spare parts for complete drone operations.",
    heroImage: heroAssets.mappingFlight,
    showcaseImage: {
      src: "/media/mithron/catalog/mithron-drone-category.png",
      alt: "Mithron accessories category showcase",
      width: 1881,
      height: 836,
      navbarInk: resolveCategoryNavbarInkByCmsRouteKey("accessories") ?? "light"
    }
  },
  industrial: {
    title: "Global Products",
    subtitle: "Specialist products and global import/export selections from the Mithron store.",
    heroImage: heroAssets.securityGrid,
    showcaseImage: {
      src: catalogShowcaseAssets.globalProductsCategory,
      alt: "Global Product — One vision. Everywhere. Professional cinema and camera equipment showcase.",
      width: catalogShowcaseFrame.width,
      height: catalogShowcaseFrame.height,
      navbarInk: resolveCategoryNavbarInkByCmsRouteKey("industrial") ?? "light",
      fit: "cinematic"
    }
  },
  mapping: {
    title: "Survey drones",
    subtitle: "Survey-grade mapping, terrain intelligence, and RTK-ready aerial data solutions.",
    heroImage: heroAssets.mappingFlight,
    showcaseImage: {
      src: catalogShowcaseAssets.surveyDronesCategory,
      alt: "Survey drone cinematic category showcase",
      width: 1915,
      height: 821,
      navbarInk: resolveCategoryNavbarInkByCmsRouteKey("mapping") ?? "light"
    }
  },
  surveillance: {
    title: "Surveillance drones",
    subtitle: "Thermal awareness, perimeter monitoring, and aerial response solutions for critical operations.",
    heroImage: heroAssets.securityGrid,
    showcaseImage: {
      src: catalogShowcaseAssets.surveillanceDronesCategory,
      alt: "Surveillance drone cinematic category showcase",
      width: 1915,
      height: 821,
      navbarInk: resolveCategoryNavbarInkByCmsRouteKey("surveillance") ?? "light"
    }
  }
} satisfies Record<string, CatalogRouteConfig>;
