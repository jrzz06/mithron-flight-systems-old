import "server-only";

import { hydrateStorefrontMediaAssets } from "@/config/generated-assets";
import { heroSlides, interests } from "@/config/products";

export function hydrateDefaultStorefrontMedia() {
  hydrateStorefrontMediaAssets({ slides: heroSlides, interests });
}
