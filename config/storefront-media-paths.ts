/**
 * Canonical storefront media paths — single registry for all static image identifiers.
 * Runtime delivery resolves through lib/media/resolve-storefront-src.ts (local → Supabase remote map).
 * Product images are owned by Supabase media_assets, not this registry.
 */
export const storefrontMediaPaths = {
  hero: {
    slide01: "/assets/hero/hero-slide-01.webp",
    slide02: "/assets/hero/hero-slide-02.webp",
    slide03: "/assets/hero/hero-slide-03.webp",
    slide04: "/assets/hero/hero-slide-04.webp",
    ag10Command: "/assets/hero/hero-slide-01.webp",
    mappingFlight: "/assets/hero/hero-slide-02.webp",
    securityGrid: "/assets/hero/hero-slide-04.webp"
  },
  showcase: {
    droneWorld: "/media/mithron/showcase/drone_world_hero.png",
    droneCare: "/media/mithron/showcase/drone_care_hero.png",
    globalProducts: "/media/mithron/showcase/global_products_hero.png"
  },
  press: {
    companyNetwork: "/media/mithron/press/mithron-company-network.webp",
    precisionPilotEcosystem: "/media/mithron/press/precision-pilot-ecosystem.webp",
    indiaDroneMarket: "/media/mithron/press/india-drone-market.webp"
  },
  shell: {
    wordmark: "/media/mithron/shell/mithron-wordmark.png"
  },
  catalog: {
    agriDrone: "/media/mithron/catalog/agri-drone-category.png",
    videoDrone: "/media/mithron/catalog/video-drone-category.png",
    creativeDrone: "/media/mithron/catalog/creative-drone-category.png",
    mithronDrone: "/media/mithron/catalog/mithron-drone-category.png",
    surveyDrone: "/media/mithron/catalog/survey-drone-category.png",
    surveillanceDrone: "/media/mithron/catalog/surveillance-drone-category.png",
    globalProducts: "/media/mithron/catalog/global-products-category.png"
  },
  interests: {
    components: "/media/mithron/interests/components.webp",
    agriculture: "/media/mithron/interests/agriculture.webp",
    videoDrones: "/media/mithron/interests/video-drones.webp",
    creativeDrones: "/media/mithron/interests/creative-drones.webp",
    mapping: "/media/mithron/interests/mapping.webp",
    smartFarming: "/media/mithron/interests/smart-farming.webp",
    defenseSecurity: "/media/mithron/interests/defense-security.webp",
    industrialInspection: "/media/mithron/interests/industrial-inspection.webp",
    surveillance: "/media/mithron/interests/surveillance.webp"
  },
  missionAgrone: {
    droneOwnerRegistration: "/media/mithron/mission/agrone/agrone-drone-owner-registration.png",
    pilotRegistration: "/media/mithron/mission/agrone/agrone-pilot-registration.png",
    allIndiaDroneFarmer: "/media/mithron/mission/agrone/all-india-drone-farmer.png",
    smartFarmerRegister: "/media/mithron/mission/agrone/smart-farmer-register.png",
    agriDroneLoan: "/media/mithron/mission/agrone/agri-drone-loan.png"
  },
  missionCity: {
    dronelancerModel: "/media/mithron/mission/city/dronelancer-model.png",
    rentalServicesApp: "/media/mithron/mission/city/city-drone-rental-services-app.png",
    franchiseCareCenter: "/media/mithron/mission/city/drone-franchisecare-center.png",
    technicianAggregation: "/media/mithron/mission/city/drone-technician-aggregation.png",
    allDroneAcademic: "/media/mithron/mission/city/all-drone-acadamic.png"
  },
  dynamicScroll: {
    agricultureFlight: "/media/mithron/dynamic-scroll/agriculture-flight.webp",
    ecosystemHardware: "/media/mithron/dynamic-scroll/ecosystem-hardware.webp",
    globalMission: "/media/mithron/dynamic-scroll/global-mission.webp",
    nightSurveillance: "/media/mithron/dynamic-scroll/night-surveillance.webp"
  },
  story: {
    precisionSpray: "/media/mithron/story/precision-spray.webp",
    terrainRadar: "/media/mithron/story/terrain-radar.webp",
    missionPlanning: "/media/mithron/story/mission-planning.webp",
    droneEcosystem: "/media/mithron/story/drone-ecosystem.webp",
    cropHealth: "/media/mithron/story/crop-health.webp"
  },
  mission: {
    precisionSpray: "/media/mithron/mission/precision-spray.webp",
    cropHealth: "/media/mithron/mission/crop-health.webp",
    missionPlanning: "/media/mithron/mission/mission-planning.webp",
    terrainRadar: "/media/mithron/mission/terrain-radar.webp",
    droneEcosystem: "/media/mithron/mission/drone-ecosystem.webp"
  },
  categories: {
    industrialInspection: "/media/mithron/categories/industrial-inspection.webp",
    defenseSecurity: "/media/mithron/categories/defense-security.webp",
    surveillance: "/media/mithron/categories/surveillance.webp"
  },
  operations: {
    infrastructure: "/media/mithron/operations/operational-ecosystem-infrastructure-source.png",
    mapBanner: "/media/mithron/operations/map-banner.png"
  }
} as const;

export const MITHRON_WORDMARK_SRC = storefrontMediaPaths.shell.wordmark;
