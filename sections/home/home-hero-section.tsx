import { HeroLcpPreloadLinks } from "@/components/media/hero-lcp-preload-links";
import { HeroCarouselDynamic, HeroCarouselSkeleton } from "@/sections/home/hero-carousel-dynamic";
import { getPublicHeroBanners, getPublicHeroBannersForCmsPreview } from "@/services/cms";
import type { HeroSlide } from "@/config/types";

export async function HomeHeroSection({
  cmsDraftPreview = false,
  heroBanners
}: {
  cmsDraftPreview?: boolean;
  heroBanners?: HeroSlide[];
}) {
  const slides =
    heroBanners ??
    (cmsDraftPreview ? await getPublicHeroBannersForCmsPreview() : await getPublicHeroBanners());

  return (
    <>
      <HeroLcpPreloadLinks slides={slides} />
      <HeroCarouselDynamic slides={slides} cmsSectionKey="hero" />
    </>
  );
}

export { HeroCarouselSkeleton as HomeHeroFallback };
