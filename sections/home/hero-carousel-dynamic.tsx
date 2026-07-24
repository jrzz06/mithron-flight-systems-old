import dynamic from "next/dynamic";
import type { HeroSlide } from "@/config/types";
import { SoftErrorBoundary } from "@/components/soft-error-boundary";

export function HeroCarouselSkeleton() {
  return (
    <section
      id="hero"
      data-testid="home-hero"
      data-hero-skeleton
        data-navbar-ink="light"
        data-navbar-ink-surface=""
      className="hero-premium-field relative isolate h-[min(76svh,720px)] min-h-[max(52svh,360px)] md:h-[80svh] md:min-h-[580px] w-full overflow-hidden bg-[#050505]"
      aria-busy="true"
      aria-label="Loading hero carousel"
    />
  );
}

const HeroCarouselClient = dynamic(
  () => import("@/sections/home/hero-carousel").then((mod) => ({ default: mod.HeroCarousel })),
  { loading: () => <HeroCarouselSkeleton /> }
);

export function HeroCarouselDynamic({
  slides,
  cmsSectionKey
}: {
  slides?: HeroSlide[];
  cmsSectionKey?: string;
}) {
  return (
    <SoftErrorBoundary label="Hero">
      <HeroCarouselClient slides={slides} cmsSectionKey={cmsSectionKey} />
    </SoftErrorBoundary>
  );
}
