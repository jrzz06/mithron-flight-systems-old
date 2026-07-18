import { Suspense } from "react";
import { HomeBelowHero } from "@/sections/home/home-below-hero";
import { HomeHeroFallback, HomeHeroSection } from "@/sections/home/home-hero-section";
import { getHomepageBundle } from "@/services/homepage-bundle";

function HomeBelowHeroFallback() {
  return <div className="min-h-[40vh] animate-pulse bg-[#eef0f3]" aria-hidden="true" />;
}

async function HomeHeroAsync({ cmsDraftPreview }: { cmsDraftPreview: boolean }) {
  const bundle = await getHomepageBundle(cmsDraftPreview);
  return (
    <HomeHeroSection
      cmsDraftPreview={cmsDraftPreview}
      heroBanners={bundle.heroBanners}
    />
  );
}

async function HomeBelowHeroAsync({ cmsDraftPreview }: { cmsDraftPreview: boolean }) {
  const bundle = await getHomepageBundle(cmsDraftPreview);
  return (
    <HomeBelowHero
      cmsDraftPreview={cmsDraftPreview}
      cms={bundle.cms}
      products={bundle.products}
      homepageCms={bundle.homepageCms}
      homepageCmsV2={bundle.homepageCmsV2}
      relatedArticles={bundle.relatedArticles}
      pressCoverage={bundle.pressCoverage}
      customerReviews={bundle.customerReviews}
    />
  );
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
