import type { Product } from "@/config/types";

export type ProductShelfSection = "drone-world" | "drone-care";
export type HomepageShelfSection = "drone-world" | "drone-care" | "global-products";

export type ProductShelfInput = Pick<Product, "slug" | "name" | "tagline" | "category" | "interests" | "specs">;

export const GLOBAL_PRODUCTS_CATEGORY = "Global Products";

export const DRONE_WORLD_CATEGORIES = new Set([
  "Agri Drones",
  "Video Drones",
  "Creative Drones",
  "Surveillance Drones"
]);

const DRONE_MISSION_CATEGORIES = DRONE_WORLD_CATEGORIES;

const ACCESSORY_CATEGORY = "Accessories";

export const accessorySlugOverrides = new Set([
  "source-mini-x-nano-4k-1-set-of-battery",
  "source-namoag",
  "source-ag-fc-namoag-gps-with-aerogcs-green-software-combo",
  "source-ag-fc-with-aerogcs-green-combo",
  "source-siyi-a2-mini-ultra-wide-angle-fpv-gimbal-single-axis-camera-sensor",
  "source-skydroid-c10-three-axis-gimbal-camera",
  "source-siyi-a8-mini-4k-8mp-ultra-hd-6x-digital-zoom-gimbal-camera",
  "source-decafly-d5x-battery-frame",
  "source-decafly-d5x-cfrp-arm-black",
  "source-decafly-d5x-3d-printed-arm-white",
  "source-decafly-d5x-landing-gear",
  "source-decafly-d5x-cfrp-frame",
  "source-18-inch-drone-frame",
  "source-15-inch-drone-frame",
  "source-skydroid-h12-with-inbuilt-screen-and-camera-remote-control",
  "source-skyrc-pc1080-dual-channel-charger-for-agriculture-drone-batteries",
  "source-jiyi-terrain-following-radar-for-agriculture-drones"
]);

export const droneAircraftSlugOverrides = new Set([
  "source-nuno-no-tc-required",
  "source-monal-4k",
  "source-monal-4k-thermal"
]);

const STRONG_ACCESSORY_PATTERNS: RegExp[] = [
  /\b(?:lipo|li-ion)\b/i,
  /\bbatter(?:y|ies)\b/i,
  /\bcharger\b/i,
  /\bcharging[\s-]?hub\b/i,
  /\bpropeller(?:s)?\b/i,
  /\bsets?[\s-]?of[\s-]?propeller/i,
  /\b(?:rc[\s-]?)?controller\b/i,
  /\btransmitter\b/i,
  /\breceiver\b/i,
  /\bflight[\s-]?controller\b/i,
  /\bremote[\s-]?control\b/i,
  /\b(?:hexa[\s-]?)?air[\s-]?frame\b/i,
  /\b(?:drone[\s-]?)?frame\b/i,
  /\b(?:drone[\s-]?)?arm\b/i,
  /\blanding[\s-]?gear\b/i,
  /\bmotor[\s-]?only\b/i,
  /\b(?:\d{3,4}sl|\d{4}[a-z]{0,3})[\s-]?\d{2,3}kv\b/i,
  /\bkv[\s-]?\d{2,3}\b/i,
  /\bpump(?:s)?\b/i,
  /\bpump[\s-]?combo\b/i,
  /\b(?:power[\s-]?)?cube\b/i,
  /\bcable(?:s)?\b/i,
  /\bconnector(?:s)?\b/i,
  /\b(?:xt60|current[\s-]?sensor)\b/i,
  /\b(?:battery[\s-]?)?plate\b/i,
  /\bprotector[\s-]?shield\b/i,
  /\b(?:spare|replacement|repair)\b/i,
  /\bmaintenance[\s-]?kit\b/i,
  /\b(?:case|bag|storage)\b/i,
  /\bgimbal[\s-]?(?:camera|sensor)\b/i,
  /\bsoftware\b/i,
  /\bpix4d\b/i,
  /\bgnss[\s-]?(?:receiver|module)\b/i,
  /\btripod\b/i,
  /\btribrach\b/i,
  /\btank(?:s)?\b/i,
  /\bfesto\b/i,
  /\boutlet[\s-]?cap\b/i,
  /\b(?:carrier|core)[\s-]?board\b/i,
  /\bcan[\s-]?hub\b/i,
  /\bterrain[\s-]?following[\s-]?radar\b/i,
  /\bdecafly[\s-]?d5x[\s-]?(?:battery[\s-]?frame|cfrp|3d[\s-]?printed|landing[\s-]?gear)\b/i,
  /\b(?:adaptor|adapter)\b/i,
  /\b(?:hpc|voltrox|skyrc)\b/i,
  /\b(?:namoag|aerogcs|aerofc|mk2[\s-]?flight[\s-]?core)\b/i,
  /\b1[\s-]?set[\s-]?of[\s-]?battery\b/i,
  /\bfor[\s-]?(?:agricultural|agriculture|agri)[\s-]?drone[\s-]?parts?\b/i,
  /\bcompatible[\s-]?with\b/i,
  /\b(?:ag\+\+|ag\+\+ \(fc\))\b/i
];

const DRONE_AIRCRAFT_PATTERNS: RegExp[] = [
  /\b(?:agri|agriculture|kisan|spraycopter|sprayer|spreader|seed)[\s-].*\bdrone\b/i,
  /\bdrone[\s-]?(?:soccer|decafly)\b/i,
  /\b(?:survey|mapping|cinema|videography|surveillance|thermal|delivery|student|fpv)\s+drone\b/i,
  /\b(?:monal|pluto|guru|flybox|nuno|decafly|mini[\s-]x[\s-]nano|sky[\s-]pro)\b/i,
  /\b\d+[\s-]?(?:l|liter|liters|kg)[\s-].*\bdrone\b/i,
  /\bdrone[\s-]with\b/i,
  /\b(?:dual[\s-]?purpose|type[\s-]?certified|tc[\s-]?(?:licensed|certified))[\s-].*\bdrone\b/i,
  /\b(?:10x|24mp|multispectral|4k|camera)[\s-].*\b(?:survey|drone)\b/i,
  /\bdrone\b.*\b(?:sprayer|spreader|nozzle[\s-]?system|safety|security)\b/i
];

function productPrimaryText(product: ProductShelfInput) {
  return [product.slug, product.name, product.category].join(" ").toLowerCase();
}

function productFullText(product: ProductShelfInput) {
  return [
    product.slug,
    product.name,
    product.tagline,
    product.category,
    ...(product.interests ?? []),
    product.specs?.["Product ID"] ?? ""
  ].join(" ").toLowerCase();
}

function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function isDroneCareProduct(product: ProductShelfInput) {
  return classifyProductShelf(product) === "drone-care";
}

export function isDroneAircraft(product: ProductShelfInput) {
  return classifyProductShelf(product) === "drone-world";
}

export function classifyProductShelf(product: ProductShelfInput): ProductShelfSection {
  if (accessorySlugOverrides.has(product.slug)) {
    return "drone-care";
  }

  if (droneAircraftSlugOverrides.has(product.slug)) {
    return "drone-world";
  }

  const text = productPrimaryText(product);

  if (matchesAny(text, STRONG_ACCESSORY_PATTERNS)) {
    return "drone-care";
  }

  if (matchesAny(text, DRONE_AIRCRAFT_PATTERNS)) {
    return "drone-world";
  }

  if (product.category === ACCESSORY_CATEGORY || product.interests?.includes("components")) {
    return "drone-care";
  }

  if (DRONE_MISSION_CATEGORIES.has(product.category)) {
    return "drone-world";
  }

  return "drone-care";
}

export function filterDroneWorldProducts<T extends ProductShelfInput>(products: T[]) {
  return products.filter((product) => classifyProductShelf(product) === "drone-world");
}

export function filterDroneCareProducts<T extends ProductShelfInput>(products: T[]) {
  return products.filter((product) => classifyProductShelf(product) === "drone-care");
}

export function normalizeProductCategory(category: string) {
  return category.trim().toLowerCase();
}

export function isGlobalProductsCategory(product: ProductShelfInput) {
  return normalizeProductCategory(product.category) === normalizeProductCategory(GLOBAL_PRODUCTS_CATEGORY);
}

export function isDroneWorldCategory(product: ProductShelfInput) {
  return DRONE_WORLD_CATEGORIES.has(product.category);
}

export function isDroneCareShelfProduct(product: ProductShelfInput) {
  return !isGlobalProductsCategory(product)
    && !isDroneWorldCategory(product)
    && classifyProductShelf(product) === "drone-care";
}

export function resolveHomepageShelf(product: ProductShelfInput): HomepageShelfSection {
  if (isGlobalProductsCategory(product)) return "global-products";
  if (isDroneWorldCategory(product)) return "drone-world";
  if (isDroneCareShelfProduct(product)) return "drone-care";
  return "drone-care";
}

export function inferMissionCategory(product: ProductShelfInput): string {
  if (!isDroneAircraft(product)) {
    return ACCESSORY_CATEGORY;
  }

  const text = productFullText(product);

  if (/\b(?:drone[\s-]?soccer|student[\s-]?drone|pluto|guru[\s-]?student|soccer[\s-]?drone)\b/i.test(text)) {
    return "Creative Drones";
  }

  if (/\b(?:surveillance|safety[\s-]?security|thermal|monal|nuno)\b/i.test(text)) {
    return "Surveillance Drones";
  }

  if (/\b(?:survey|mapping|pix4d|gnss|mapper|matic|multispectral|24mp|10x)\b/i.test(text)) {
    return "Survey Drones";
  }

  if (/\b(?:video|cinema|4k|videography|decafly|mini[\s-]x[\s-]nano|sky[\s-]pro)\b/i.test(text)) {
    return "Video Drones";
  }

  if (/\b(?:agri|spray|spreader|kisan|liter|tc[\s-]?(?:licensed|certified)|seed|flybox|nozzle[\s-]?system)\b/i.test(text)) {
    return "Agri Drones";
  }

  return "Agri Drones";
}
