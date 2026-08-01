import { Suspense } from "react";
import { fallbackSnapshot } from "@/services/cms";
import { mergeHomepageCmsContent } from "@/services/homepage-cms";
import { defaultHomepageCmsV2Content } from "@/config/homepage-cms-v2";
import { HomeBelowHero } from "@/sections/home/home-below-hero";
import { HomeHeroFallback, HomeHeroSection } from "@/sections/home/home-hero-section";
import { getHomepageBelowFoldData, getHomepageHeroBanners } from "@/services/homepage-bundle";

/**
 * Reserves multi-viewport height while below-fold CMS/products stream in.
 * Geometry mirrors HomeLandingComposite defaults (shelves → full-viewport banners →
 * mission chapters → testimonials/articles/footer) so first paint is scrollable
 * and Suspense resolve does not expand document height from ~40vh.
 */
function HomeBelowHeroFallback() {
  return (
    <div data-home-below-hero-skeleton aria-hidden="true">
      {/* Mini carousel + 3 product shelves + inter-shelf banners */}
      <div className="min-h-[88svh] animate-pulse bg-[#eef0f3]" />
      {/* HomeFullViewportBanner × 2 — min-height: 100dvh */}
      <div className="min-h-[100dvh] animate-pulse bg-[#e8eaed]" />
      <div className="min-h-[100dvh] animate-pulse bg-[#eef0f3]" />
      {/* Agri + City mission sections — clamp(700px, 95svh, 110svh) */}
      <div
        className="animate-pulse bg-[#e8eaed]"
        style={{ minHeight: "clamp(700px, 95svh, 110svh)" }}
      />
      <div
        className="animate-pulse bg-[#eef0f3]"
        style={{ minHeight: "clamp(700px, 95svh, 110svh)" }}
      />
      {/* Testimonials + related articles + footer */}
      <div className="min-h-[50vh] animate-pulse bg-[#e8eaed]" />
    </div>
  );
}

async function HomeHeroAsync({ cmsDraftPreview }: { cmsDraftPreview: boolean }) {
  let heroBanners: Awaited<ReturnType<typeof getHomepageHeroBanners>> = [];
  try {
    heroBanners = await getHomepageHeroBanners(cmsDraftPreview);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[home] hero banners failed; rendering empty hero: ${message}`);
  }
  return (
    <HomeHeroSection
      cmsDraftPreview={cmsDraftPreview}
      heroBanners={heroBanners}
    />
  );
}

async function HomeBelowHeroAsync({ cmsDraftPreview }: { cmsDraftPreview: boolean }) {
  try {
    const bundle = await getHomepageBelowFoldData(cmsDraftPreview);
    return (
      <HomeBelowHero
        cmsDraftPreview={cmsDraftPreview}
        cms={bundle.cms}
        products={bundle.products}
        homepageCms={bundle.homepageCms}
        homepageCmsV2={bundle.homepageCmsV2}
        relatedArticles={bundle.relatedArticles}
        pressCoverage={bundle.pressCoverage}
      />
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[home] below-fold bundle failed; rendering degraded homepage: ${message}`);
    // Always resolve Suspense — never leave the gray pulse shell stuck on screen.
    return (
      <HomeBelowHero
        cmsDraftPreview={cmsDraftPreview}
        cms={fallbackSnapshot}
        products={[]}
        homepageCms={mergeHomepageCmsContent({})}
        homepageCmsV2={defaultHomepageCmsV2Content}
        relatedArticles={[]}
        pressCoverage={[]}
      />
    );
  }
}

export function HomePageContent({ cmsDraftPreview = false }: { cmsDraftPreview?: boolean }) {
  return (
    <>
      <Suspense fallback={<HomeHeroFallback />}>
        <HomeHeroAsync cmsDraftPreview={cmsDraftPreview} />
      </Suspense>
      <Suspense fallback={<HomeBelowHeroFallback />}>
        <HomeBelowHeroAsync cmsDraftPreview={cmsDraftPreview} />
      </Suspense>
    </>
  );
}
