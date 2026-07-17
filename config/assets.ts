import { storefrontMediaPaths } from "@/config/storefront-media-paths";

export const assetHosts = ["www.mithron.co", "www.mithronsmart.com"] as const;

export const heroAssets = {
  ag10Command: storefrontMediaPaths.hero.ag10Command,
  securityGrid: storefrontMediaPaths.hero.securityGrid,
  mappingFlight: storefrontMediaPaths.hero.mappingFlight
};

export const catalogShowcaseAssets = {
  agricultureCategory: storefrontMediaPaths.catalog.agriDrone,
  videoDronesCategory: storefrontMediaPaths.catalog.videoDrone,
  creativeDronesCategory: storefrontMediaPaths.catalog.creativeDrone,
  surveyDronesCategory: storefrontMediaPaths.catalog.surveyDrone,
  surveillanceDronesCategory: storefrontMediaPaths.catalog.surveillanceDrone,
  globalProductsCategory: storefrontMediaPaths.catalog.globalProducts
};

export const interestAssets = {
  agriculture: storefrontMediaPaths.interests.agriculture,
  videoDrones: storefrontMediaPaths.interests.videoDrones,
  creativeDrones: storefrontMediaPaths.interests.creativeDrones,
  mapping: storefrontMediaPaths.interests.mapping,
  smartFarming: storefrontMediaPaths.interests.smartFarming,
  defenseSecurity: storefrontMediaPaths.interests.defenseSecurity,
  industrialInspection: storefrontMediaPaths.interests.industrialInspection,
  surveillance: storefrontMediaPaths.interests.surveillance,
  components: storefrontMediaPaths.interests.components
};
