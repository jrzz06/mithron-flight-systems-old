import { Suspense } from "react";
import { fallbackSnapshot } from "@/services/cms";
import { mergeHomepageCmsContent } from "@/services/homepage-cms";
import { defaultHomepageCmsV2Content } from "@/config/homepage-cms-v2";
import { HomeBelowHero } from "@/sections/home/home-below-hero";
import { HomeHeroFallback, HomeHeroSection } from "@/sections/home/home-hero-section";
import { getHomepageBelowFoldData, getHomepageHeroBanners } from "@/services/homepage-bundle";

function HomeBelowHeroFallback() {
  return <div className="min-h-[40vh] animate-pulse bg-[#eef0f3]" aria-hidden="true" />;
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
