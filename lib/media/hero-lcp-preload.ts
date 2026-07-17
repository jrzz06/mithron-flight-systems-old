import type { HeroSlide } from "@/config/types";
import { resolveHeroCarouselSlides } from "@/lib/media/resolve-hero-carousel-slides";
import {
  canonicalStorefrontPath,
  getStorefrontResponsiveAsset,
  resolveHeroSlideSrc
} from "@/lib/media/resolve-storefront-src";
import { resolvePublicMediaUrl } from "@/lib/media/storage-provider";

const HERO_LCP_MAX_WIDTH = 1536;
export const HERO_LCP_IMAGE_SIZES = "(max-width: 767px) 750px, (max-width: 1279px) 1024px, 1920px";

export type HeroLcpPreloadLink = {
  href: string;
  type?: string;
  imageSrcSet?: string;
  imageSizes?: string;
};

function buildWebpPreloadLink(variants: { width: number; src: string }[]): HeroLcpPreloadLink | null {
  if (variants.length === 0) return null;

  const relevant = [...variants]
    .filter((variant) => variant.width <= HERO_LCP_MAX_WIDTH)
    .sort((left, right) => left.width - right.width);
  const selected = relevant.length > 0 ? relevant : [...variants].sort((left, right) => left.width - right.width);
  const best = selected.at(-1);
  if (!best) return null;

  return {
    href: resolvePublicMediaUrl(best.src),
    type: "image/webp",
    imageSrcSet: selected.map((variant) => `${resolvePublicMediaUrl(variant.src)} ${variant.width}w`).join(", "),
    imageSizes: HERO_LCP_IMAGE_SIZES
  };
}

export function getHeroLcpPreloadLinks(slides: HeroSlide[]): HeroLcpPreloadLink[] {
  const firstSlide = resolveHeroCarouselSlides(slides)[0];
  if (!firstSlide) return [];

  const responsive = firstSlide.image.responsive;
  const responsiveLink = responsive?.variants.webp?.length
    ? buildWebpPreloadLink(responsive.variants.webp)
    : null;
  if (responsiveLink) return [responsiveLink];

  const canonicalPath = canonicalStorefrontPath(firstSlide.image.src);
  const mappedAsset = canonicalPath.startsWith("/") ? getStorefrontResponsiveAsset(canonicalPath) : undefined;
  const mappedLink = mappedAsset?.variants.webp?.length
    ? buildWebpPreloadLink(mappedAsset.variants.webp)
    : null;
  if (mappedLink) return [mappedLink];

  const href = resolveHeroSlideSrc(firstSlide.image.src, firstSlide.id);
  if (!href) return [];

  return [
    {
      href,
      type: /\.webp($|\?)/i.test(href) ? "image/webp" : undefined
    }
  ];
}
