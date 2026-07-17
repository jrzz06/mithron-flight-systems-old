"use client";

import type { ProductPageReview } from "@/lib/product-reviews/types";
import {
  getHomepageSectionDefinition,
  fullViewportBannerIndex,
  interShelfBannerIndex,
  missionKeyFromSectionId,
  shelfKeyFromSectionId,
  type HomepageSectionId
} from "@/config/homepage-section-registry";
import type { Product } from "@/config/types";
import { useOptionalHomepageBuilder } from "@/features/admin/cms/homepage-builder-context";
import { CmsSyncErrorPanel } from "@/components/admin/cms/cms-sync-error-panel";
import { resolveHomeMiniCarouselItems } from "@/lib/home/mini-carousel";
import {
  resolveHomepageLandingState,
  resolveMissionEditorState,
  resolveShelfEditorState
} from "@/lib/home/homepage-resolution";
import { HomeInterShelfBanner } from "@/sections/home/home-inter-shelf-banner";
import { HomeMiniCarousel } from "@/sections/home/home-mini-carousel";
import { AgriCommunityWorldSection, CityDroneWorldSection } from "@/sections/home/home-landing-composite";
import {
  HomeClientTestimonialsSection,
  pickHomeTestimonialItems
} from "@/sections/home/home-client-testimonials-section";
import { ProductShelfSection } from "@/sections/home/product-shelf-section";
import { HomeFullViewportBanner } from "@/sections/home/home-full-viewport-banner";
import { HomeRelatedArticlesSection } from "@/sections/home/home-related-articles-section";
import type { HomepageCmsContent } from "@/config/homepage-cms";
import type { HomepageCmsV2Content } from "@/config/homepage-cms-v2";

export function HomepageSectionPreview({
  sectionId,
  homepageCms,
  homepageV2,
  products,
  productReviews = [],
  shelfProductSlugs,
  syncError
}: {
  sectionId: HomepageSectionId;
  homepageCms: HomepageCmsContent;
  homepageV2: HomepageCmsV2Content;
  products: Product[];
  productReviews?: ProductPageReview[];
  shelfProductSlugs?: string[];
  syncError?: string | null;
}) {
  const builder = useOptionalHomepageBuilder();
  const cms = builder?.draft.homepageCms ?? homepageCms;
  const v2 = builder?.draft.homepageV2 ?? homepageV2;
  const catalog = builder?.draft.products ?? products;
  const definition = getHomepageSectionDefinition(sectionId);

  const content = (() => {
    if (syncError) {
      return <CmsSyncErrorPanel message={syncError} />;
    }

    if (!definition) return null;

    if (definition.editorKind === "mini-carousel") {
      const items = resolveHomeMiniCarouselItems(catalog, v2.miniCarousel);
      return v2.miniCarousel.enabled !== false ? <HomeMiniCarousel items={items} /> : null;
    }

    const interIndex = interShelfBannerIndex(sectionId);
    if (interIndex !== null) {
      const banner = v2.banners.interShelf[interIndex];
      return <HomeInterShelfBanner banner={banner} testId={`banner-inter-shelf-${interIndex + 1}`} />;
    }

    const fullIndex = fullViewportBannerIndex(sectionId);
    if (fullIndex !== null) {
      return <HomeFullViewportBanner banner={v2.banners.fullViewport[fullIndex]} testId={`banner-full-viewport-${fullIndex + 1}`} />;
    }

    const shelfKey = shelfKeyFromSectionId(sectionId);
    if (shelfKey) {
      const draftSlugs = shelfProductSlugs ?? builder?.draft.shelfProductSlugs[shelfKey];
      const shelfState = resolveShelfEditorState(shelfKey, cms, catalog, draftSlugs);
      if (!shelfState.chapter) {
        return <CmsSyncErrorPanel message="Could not resolve shelf preview from the live homepage configuration." />;
      }
      if (!shelfState.effectiveProducts.length) {
        return <CmsSyncErrorPanel message="No published products are available for this shelf preview." />;
      }
      return (
        <ProductShelfSection
          chapter={shelfState.chapter}
          config={shelfState.config}
          products={catalog}
        />
      );
    }

    const missionKey = missionKeyFromSectionId(sectionId);
    if (missionKey) {
      const missionState = resolveMissionEditorState(missionKey, cms);
      const landing = resolveHomepageLandingState(cms);
      if (missionKey === "agri") {
        return (
          <AgriCommunityWorldSection
            chapter={missionState.chapter}
            config={landing.missionConfigs["agri-drones"]}
          />
        );
      }
      return (
        <CityDroneWorldSection
          chapter={missionState.chapter}
          config={landing.missionConfigs["city-drones"]}
        />
      );
    }

    if (definition.editorKind === "reviews-section") {
      const reviewItems = pickHomeTestimonialItems(
        productReviews,
        catalog,
        v2.reviews.maxCount
      );
      return <HomeClientTestimonialsSection items={reviewItems} header={cms.testimonials} />;
    }

    if (definition.editorKind === "related-articles") {
      return <HomeRelatedArticlesSection posts={[]} pressItems={[]} customItems={v2.relatedArticles.items} />;
    }

    return null;
  })();

  return (
    <div data-homepage-section-preview={sectionId} className="overflow-auto pb-4">
      {content}
    </div>
  );
}
