import type { HeroSlide } from "@/config/types";

/**
 * Normalize published hero slides from Supabase.
 * Does not inject demo/config slides — empty CMS means empty carousel.
 */
export function resolveHeroCarouselSlides(slides: HeroSlide[]) {
  return slides
    .filter((slide) => slide.id !== "surveillance-grid")
    .slice(0, 3);
}
