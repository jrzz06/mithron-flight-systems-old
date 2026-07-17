import type { HeroSlide } from "@/config/types";
import { heroSlides as defaultHeroSlides } from "@/config/products";

export function resolveHeroCarouselSlides(slides: HeroSlide[]) {
  const normalizeSlides = (input: HeroSlide[]) =>
    input
      .filter((slide) => slide.id !== "surveillance-grid")
      .slice(0, 3);

  if (slides.length >= 2) return normalizeSlides(slides);
  return defaultHeroSlides.length >= 2 ? normalizeSlides(defaultHeroSlides) : normalizeSlides(slides);
}
