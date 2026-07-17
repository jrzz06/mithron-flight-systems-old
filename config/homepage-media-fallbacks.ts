import type { MediaAsset } from "@/config/types";
import { storefrontMediaPaths } from "@/config/storefront-media-paths";

type ProofState = "VERIFIED" | "FALLBACK";

export type HomepageMediaFallback = Pick<MediaAsset, "src" | "alt"> & {
  caption: string;
  sourceState: ProofState;
};

/** Homepage composite fallbacks when CMS content is unavailable. Paths from storefront-media-paths registry. */
export const homepageMediaFallbacks = {
  droneWorld: {
    src: storefrontMediaPaths.showcase.droneWorld,
    alt: "Mithron drone fleet operating across a rugged mountain valley at golden hour",
    caption: "Aircraft, payload, pilot, and route context",
    sourceState: "VERIFIED"
  },
  droneCare: {
    src: storefrontMediaPaths.showcase.droneCare,
    alt: "Mithron Drone Care complete kit with aircraft, controller, batteries, propellers, and service case",
    caption: "Spares, care paths, and operating continuity",
    sourceState: "VERIFIED"
  },
  globalProducts: {
    src: storefrontMediaPaths.showcase.globalProducts,
    alt: "Global Drone Connect industrial drone carrying a shipping container over a digital logistics hub at night",
    caption: "Professional products from the Mithron store",
    sourceState: "VERIFIED"
  },
  agri: {
    src: storefrontMediaPaths.dynamicScroll.agricultureFlight,
    alt: "Mithron agriculture drone over field rows",
    caption: "Crop spraying, mapping, and precision farming",
    sourceState: "VERIFIED"
  },
  agriField: {
    src: storefrontMediaPaths.interests.agriculture,
    alt: "Agriculture drone operating above farmland",
    caption: "Agriculture operations",
    sourceState: "VERIFIED"
  },
  smartFarming: {
    src: storefrontMediaPaths.interests.smartFarming,
    alt: "Smart farming drone operating over crop rows",
    caption: "Smart farming operations",
    sourceState: "VERIFIED"
  },
  precisionSpray: {
    src: storefrontMediaPaths.mission.precisionSpray,
    alt: "Agriculture spraying over cultivated field rows",
    caption: "Precision spray operations",
    sourceState: "VERIFIED"
  },
  cropHealth: {
    src: storefrontMediaPaths.mission.cropHealth,
    alt: "Agriculture drone monitoring crop health",
    caption: "Crop health monitoring media",
    sourceState: "VERIFIED"
  },
  missionPlanning: {
    src: storefrontMediaPaths.mission.missionPlanning,
    alt: "Drone flight planning route over mixed terrain",
    caption: "Flight planning",
    sourceState: "VERIFIED"
  },
  terrainRadar: {
    src: storefrontMediaPaths.mission.terrainRadar,
    alt: "Drone mapping terrain and route intelligence view",
    caption: "Terrain mapping media",
    sourceState: "VERIFIED"
  },
  agriCategory: {
    src: storefrontMediaPaths.catalog.agriDrone,
    alt: "Mithron agriculture drone category showcase",
    caption: "Agri drone category media",
    sourceState: "VERIFIED"
  },
  city: {
    src: storefrontMediaPaths.dynamicScroll.nightSurveillance,
    alt: "Mithron site monitoring for city operations",
    caption: "Site monitoring operations",
    sourceState: "VERIFIED"
  },
  industrialInspection: {
    src: storefrontMediaPaths.categories.industrialInspection,
    alt: "Industrial inspection drone environment",
    caption: "Industrial inspection media",
    sourceState: "VERIFIED"
  },
  defenseSecurity: {
    src: storefrontMediaPaths.categories.defenseSecurity,
    alt: "Security drone environment",
    caption: "Security and emergency operations",
    sourceState: "VERIFIED"
  },
  surveillance: {
    src: storefrontMediaPaths.categories.surveillance,
    alt: "Surveillance drone city operations",
    caption: "Surveillance operations",
    sourceState: "VERIFIED"
  },
  mapping: {
    src: storefrontMediaPaths.catalog.surveyDrone,
    alt: "Mithron survey drone mapping category",
    caption: "Survey and mapping category media",
    sourceState: "VERIFIED"
  },
  mappingFlight: {
    src: storefrontMediaPaths.hero.mappingFlight,
    alt: "Survey drone flight over mapped terrain",
    caption: "Mapping flight operations",
    sourceState: "VERIFIED"
  },
  securityGrid: {
    src: storefrontMediaPaths.hero.securityGrid,
    alt: "Security drone over an operational landscape",
    caption: "Security operations",
    sourceState: "VERIFIED"
  },
  operationsInfrastructure: {
    src: storefrontMediaPaths.operations.infrastructure,
    alt: "Drone field support and service network visual",
    caption: "Infrastructure operations media",
    sourceState: "VERIFIED"
  },
  mapBanner: {
    src: storefrontMediaPaths.operations.mapBanner,
    alt: "Drone mapping operations banner",
    caption: "Urban mapping operations media",
    sourceState: "VERIFIED"
  },
  globalMission: {
    src: storefrontMediaPaths.dynamicScroll.globalMission,
    alt: "Mithron drone over city and field context",
    caption: "Operations overview",
    sourceState: "VERIFIED"
  },
  citySmartMonitoring: {
    src: storefrontMediaPaths.missionCity.rentalServicesApp,
    alt: "City Drone Rental Services App showing drone booking and operator tools",
    caption: "City Drone Rental Services App",
    sourceState: "VERIFIED"
  },
  cityTrafficAnalytics: {
    src: storefrontMediaPaths.missionCity.dronelancerModel,
    alt: "Dronelancer network with pilot mobile app and city coordination tools",
    caption: "Dronelancer Model",
    sourceState: "VERIFIED"
  },
  cityInfrastructureInspection: {
    src: storefrontMediaPaths.missionCity.franchiseCareCenter,
    alt: "Drone FranchiseCare Center with repair bench, service hub, and connected city nodes",
    caption: "Drone FranchiseCare Center",
    sourceState: "VERIFIED"
  },
  cityCrowdMonitoring: {
    src: storefrontMediaPaths.missionCity.technicianAggregation,
    alt: "Drone technician network with service tools, operators, and city support",
    caption: "Drone Technician Aggregation",
    sourceState: "VERIFIED"
  },
  cityEmergencyResponse: {
    src: storefrontMediaPaths.missionCity.allDroneAcademic,
    alt: "All Drone Academic training, simulation, devices, and flight equipment",
    caption: "All Drone Academic",
    sourceState: "VERIFIED"
  },
  agronePilotRegistration: {
    src: storefrontMediaPaths.missionAgrone.pilotRegistration,
    alt: "AGRONE pilot standing confidently beside an agricultural drone",
    caption: "AGRONE pilot registration",
    sourceState: "VERIFIED"
  },
  agroneDroneOwnerRegistration: {
    src: storefrontMediaPaths.missionAgrone.droneOwnerRegistration,
    alt: "AGRONE drone owner standing beside a newly registered agricultural drone",
    caption: "AGRONE drone owner registration",
    sourceState: "VERIFIED"
  },
  agroneSmartFarmerRegistration: {
    src: storefrontMediaPaths.missionAgrone.smartFarmerRegister,
    alt: "Smart farmer using a tablet with an agricultural drone operating above the crop field",
    caption: "Smart farmer registration",
    sourceState: "VERIFIED"
  },
  agroneAgriDroneLoanEmi: {
    src: storefrontMediaPaths.missionAgrone.agriDroneLoan,
    alt: "Farmer evaluating agri-drone loan and EMI options on a tablet beside a drone",
    caption: "Agri drone loan and EMI check",
    sourceState: "VERIFIED"
  },
  agroneFarmerDroneBooking: {
    src: storefrontMediaPaths.missionAgrone.allIndiaDroneFarmer,
    alt: "AGRONE operator using a tablet at a drone service facility",
    caption: "All India farmer drone booking",
    sourceState: "VERIFIED"
  }
} satisfies Record<string, HomepageMediaFallback>;
