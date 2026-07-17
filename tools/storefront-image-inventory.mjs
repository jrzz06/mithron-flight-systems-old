/** Canonical storefront masters referenced by the frontend. */

import pathAliases from "../config/storefront-path-aliases.json" with { type: "json" };

export const BUCKET_BY_GROUP = {
  hero: "mithron-hero",
  shelf: "mithron-story",
  "mission-agri": "mithron-story",
  "mission-city": "mithron-story",
  catalog: "mithron-story",
  nav: "mithron-story",
  interest: "mithron-interests",
  story: "mithron-story",
  "dynamic-scroll": "mithron-story",
  mission: "mithron-story",
  operations: "mithron-story"
};

/** @type {Array<{ src: string, maxEdge: number, group: keyof typeof BUCKET_BY_GROUP, alt?: string }>} */
export const STOREFRONT_IMAGE_INVENTORY = [
  { src: "/assets/hero/hero-slide-01.webp", maxEdge: 3840, group: "hero", alt: "Mithron agriculture hero" },
  { src: "/assets/hero/hero-slide-02.webp", maxEdge: 3840, group: "hero", alt: "Mithron mapping hero" },
  { src: "/assets/hero/hero-slide-03.webp", maxEdge: 3840, group: "hero", alt: "Mithron ecosystem hero" },
  { src: "/assets/hero/hero-slide-04.webp", maxEdge: 3840, group: "hero", alt: "Mithron surveillance hero" },
  { src: "/media/mithron/showcase/drone_world_hero.png", maxEdge: 2560, group: "shelf", alt: "Drone World shelf hero" },
  { src: "/media/mithron/showcase/drone_care_hero.png", maxEdge: 2560, group: "shelf", alt: "Drone Care shelf hero" },
  { src: "/media/mithron/showcase/global_products_hero.png", maxEdge: 2560, group: "shelf", alt: "Global Products shelf hero" },
  { src: "/media/mithron/mission/agrone/agrone-drone-owner-registration.png", maxEdge: 2560, group: "mission-agri", alt: "AGRONE drone owner registration" },
  { src: "/media/mithron/mission/agrone/agrone-pilot-registration.png", maxEdge: 2560, group: "mission-agri", alt: "AGRONE pilot registration" },
  { src: "/media/mithron/mission/agrone/all-india-drone-farmer.png", maxEdge: 2560, group: "mission-agri", alt: "All India drone farmer" },
  { src: "/media/mithron/mission/agrone/smart-farmer-register.png", maxEdge: 2560, group: "mission-agri", alt: "Smart farmer register" },
  { src: "/media/mithron/mission/agrone/agri-drone-loan.png", maxEdge: 2560, group: "mission-agri", alt: "Agri drone loan" },
  { src: "/media/mithron/mission/city/dronelancer-model.png", maxEdge: 2560, group: "mission-city", alt: "Dronelancer model" },
  { src: "/media/mithron/mission/city/city-drone-rental-services-app.png", maxEdge: 2560, group: "mission-city", alt: "City drone rental app" },
  { src: "/media/mithron/mission/city/drone-franchisecare-center.png", maxEdge: 2560, group: "mission-city", alt: "FranchiseCare center" },
  { src: "/media/mithron/mission/city/drone-technician-aggregation.png", maxEdge: 2560, group: "mission-city", alt: "Technician aggregation" },
  { src: "/media/mithron/mission/city/all-drone-acadamic.png", maxEdge: 2560, group: "mission-city", alt: "All drone academic" },
  { src: "/media/mithron/catalog/agri-drone-category.png", maxEdge: 2560, group: "catalog", alt: "Agri drone category" },
  { src: "/media/mithron/catalog/video-drone-category.png", maxEdge: 2560, group: "catalog", alt: "Video drone category" },
  { src: "/media/mithron/catalog/creative-drone-category.png", maxEdge: 2560, group: "catalog", alt: "Creative drone category" },
  { src: "/media/mithron/catalog/mithron-drone-category.png", maxEdge: 2560, group: "catalog", alt: "Mithron drone category" },
  { src: "/media/mithron/catalog/survey-drone-category.png", maxEdge: 2560, group: "catalog", alt: "Survey drone category" },
  { src: "/media/mithron/catalog/surveillance-drone-category.png", maxEdge: 2560, group: "catalog", alt: "Surveillance drone category" },
  { src: "/media/mithron/catalog/global-products-category.png", maxEdge: 2560, group: "catalog", alt: "Global products category" },
  // Nav wordmark uses tools/upload-wordmark-to-supabase.mjs — never Real-ESRGAN (destroys alpha mask).
  { src: "/media/mithron/shell/mithron-wordmark.png", maxEdge: 1600, group: "nav", alt: "Mithron wordmark", skipAiEnhance: true },
  { src: "/media/mithron/interests/components.webp", maxEdge: 1600, group: "interest", alt: "Components interest" },
  { src: "/media/mithron/interests/agriculture.webp", maxEdge: 2560, group: "interest", alt: "Agriculture interest" },
  { src: "/media/mithron/interests/video-drones.webp", maxEdge: 2560, group: "interest", alt: "Video drones interest" },
  { src: "/media/mithron/interests/creative-drones.webp", maxEdge: 2560, group: "interest", alt: "Creative drones interest" },
  { src: "/media/mithron/interests/mapping.webp", maxEdge: 2560, group: "interest", alt: "Mapping interest" },
  { src: "/media/mithron/interests/smart-farming.webp", maxEdge: 2560, group: "interest", alt: "Smart farming interest" },
  { src: "/media/mithron/interests/defense-security.webp", maxEdge: 2560, group: "interest", alt: "Defense security interest" },
  { src: "/media/mithron/interests/industrial-inspection.webp", maxEdge: 2560, group: "interest", alt: "Industrial inspection interest" },
  { src: "/media/mithron/interests/surveillance.webp", maxEdge: 2560, group: "interest", alt: "Surveillance interest" },
  { src: "/media/mithron/dynamic-scroll/agriculture-flight.webp", maxEdge: 2560, group: "dynamic-scroll", alt: "Agriculture flight" },
  { src: "/media/mithron/dynamic-scroll/ecosystem-hardware.webp", maxEdge: 2560, group: "dynamic-scroll", alt: "Ecosystem hardware" },
  { src: "/media/mithron/dynamic-scroll/global-mission.webp", maxEdge: 2560, group: "dynamic-scroll", alt: "Global mission" },
  { src: "/media/mithron/dynamic-scroll/night-surveillance.webp", maxEdge: 2560, group: "dynamic-scroll", alt: "Night surveillance" },
  { src: "/media/mithron/story/precision-spray.webp", maxEdge: 2560, group: "story", alt: "Precision spray story" },
  { src: "/media/mithron/story/terrain-radar.webp", maxEdge: 2560, group: "story", alt: "Terrain radar story" },
  { src: "/media/mithron/story/mission-planning.webp", maxEdge: 2560, group: "story", alt: "Mission planning story" },
  { src: "/media/mithron/story/drone-ecosystem.webp", maxEdge: 2560, group: "story", alt: "Drone ecosystem story" },
  { src: "/media/mithron/story/crop-health.webp", maxEdge: 2560, group: "story", alt: "Crop health story" },
  { src: "/media/mithron/press/mithron-company-network.webp", maxEdge: 2560, group: "story", alt: "Agricultural drone above an Indian farmland service network" },
  { src: "/media/mithron/press/precision-pilot-ecosystem.webp", maxEdge: 2560, group: "story", alt: "Precision spraying drone with trained field pilots" },
  { src: "/media/mithron/press/india-drone-market.webp", maxEdge: 2560, group: "story", alt: "Commercial drone platforms in a modern hangar" },
  { src: "/media/mithron/mission/precision-spray.webp", maxEdge: 2560, group: "mission", alt: "Precision spray mission" },
  { src: "/media/mithron/mission/crop-health.webp", maxEdge: 2560, group: "mission", alt: "Crop health mission" },
  { src: "/media/mithron/mission/mission-planning.webp", maxEdge: 2560, group: "mission", alt: "Mission planning panel" },
  { src: "/media/mithron/mission/terrain-radar.webp", maxEdge: 2560, group: "mission", alt: "Terrain radar panel" },
  { src: "/media/mithron/mission/drone-ecosystem.webp", maxEdge: 2560, group: "mission", alt: "Drone ecosystem panel" },
  { src: "/media/mithron/categories/industrial-inspection.webp", maxEdge: 2560, group: "interest", alt: "Industrial inspection category" },
  { src: "/media/mithron/categories/defense-security.webp", maxEdge: 2560, group: "interest", alt: "Defense security category" },
  { src: "/media/mithron/categories/surveillance.webp", maxEdge: 2560, group: "interest", alt: "Surveillance category" },
  { src: "/media/mithron/operations/operational-ecosystem-infrastructure-source.png", maxEdge: 2560, group: "operations", alt: "Operations infrastructure" },
  { src: "/media/mithron/operations/map-banner.png", maxEdge: 2560, group: "operations", alt: "Map operations banner" }
];

export const AI_ENHANCEMENT_EXCLUDED_SRCS = new Set([
  "/media/mithron/shell/mithron-wordmark.png"
]);

export function isAiEnhancementExcluded(src) {
  return AI_ENHANCEMENT_EXCLUDED_SRCS.has(src);
}

export const LOCAL_PATH_ALIASES_TO_CANONICAL = pathAliases;

export function canonicalStorefrontSrc(src) {
  const trimmed = src?.trim() ?? "";
  if (!trimmed.startsWith("/")) return trimmed;
  const noQuery = trimmed.split("?")[0];
  return LOCAL_PATH_ALIASES_TO_CANONICAL[noQuery] ?? noQuery.replace(/\.(png|jpe?g)$/i, ".webp");
}

export function dedupeInventory(items) {
  const bySrc = new Map();
  for (const item of items) {
    if (!bySrc.has(item.src)) bySrc.set(item.src, item);
  }
  return [...bySrc.values()];
}
