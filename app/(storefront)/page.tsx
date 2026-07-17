import { Suspense } from "react";
import { resolveCmsDraftPreviewAccess } from "@/lib/cms/cms-preview-mode";
import { HomeBelowHero } from "@/sections/home/home-below-hero";
import { HomeHeroFallback, HomeHeroSection } from "@/sections/home/home-hero-section";
import { getHomepageBundle } from "@/services/homepage-bundle";

export const revalidate = 60;

function HomeBelowHeroFallback() {
  return <div className="min-h-[40vh] animate-pulse bg-[#eef0f3]" aria-hidden="true" />;
}

async function HomeHeroAsync({
  cmsDraftPreview
}: {
  cmsDraftPreview: boolean;
}) {
  const bundle = await getHomepageBundle(cmsDraftPreview);
  return (
    <HomeHeroSection
      cmsDraftPreview={cmsDraftPreview}
      heroBanners={bundle.heroBanners}
    />
  );
}

async function HomeBelowHeroAsync({
  cmsDraftPreview
}: {
  cmsDraftPreview: boolean;
}) {
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

export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<{ cms_preview?: string }>;
}) {
  const params = await searchParams;
  const cmsDraftPreview = await resolveCmsDraftPreviewAccess(params?.cms_preview);

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
