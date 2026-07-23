import Link from "next/link";
import { EditorRenderedContent } from "@/components/editor/editor-rendered-content";
import { editorHtmlToPlainText } from "@/lib/editor/prepare-html";
import { type CSSProperties, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { Product } from "@/config/types";
import { SiteFooter } from "@/components/layout/site-footer";
import { MithronMissionTileImage } from "@/components/media/mithron-mission-tile-image";
import { footerContent, type FooterContent } from "@/config/storefront-content";
import { isCmsStrictMode } from "@/lib/cms/strict-mode";
import type { HomepageCmsContent } from "@/config/homepage-cms";
import { getHomepageBaseCmsContent } from "@/lib/home/homepage-resolution";
import type { HomepageCmsV2Content } from "@/config/homepage-cms-v2";
import { defaultHomepageCmsV2Content } from "@/config/homepage-cms-v2";
import {
  resolveHomepageLandingState,
  type HomeChapter,
  type MissionWorldConfig,
  type MissionWorldTile
} from "@/lib/home/homepage-resolution";
import { HomeCompositeSection } from "@/sections/home/home-composite-section";
import { HomeMiniCarousel } from "@/sections/home/home-mini-carousel";
import { HomeInterShelfBanner } from "@/sections/home/home-inter-shelf-banner";
import { HomeFullViewportBanner } from "@/sections/home/home-full-viewport-banner";
import { HomeRelatedArticlesSection } from "@/sections/home/home-related-articles-section";
import {
  HomeClientTestimonialsSection,
  pickHomeTestimonialItemsFromCms,
  HOME_TESTIMONIAL_SHOWCASE_COUNT
} from "@/sections/home/home-client-testimonials-section";
import { resolveHomeMiniCarouselItems } from "@/lib/home/mini-carousel";
import type { ProductShelfConfig } from "@/lib/home/shelf-product-resolution";
import { ProductShelfSection } from "@/sections/home/product-shelf-section";
import type { BlogPost } from "@/services/blog-posts";
import type { PressCoverageItem } from "@/services/press-coverage";
import type { ProductPageReview } from "@/lib/product-reviews/types";
import styles from "./home-landing-composite.module.css";

function renderChapter({
  chapter,
  products,
  shelfConfigs,
  missionConfigs
}: {
  chapter: HomeChapter;
  products: Product[];
  shelfConfigs: Record<"drone-world" | "drone-care" | "global-products", ProductShelfConfig>;
  missionConfigs: ReturnType<typeof resolveHomepageLandingState>["missionConfigs"];
}) {
  switch (chapter.layoutKind) {
    case "ecosystem":
      return (
        <ProductShelfSection
          chapter={chapter}
          config={shelfConfigs["drone-world"]}
          products={products}
          key={chapter.id}
        />
      );
    case "care":
      return (
        <ProductShelfSection
          chapter={chapter}
          config={shelfConfigs["drone-care"]}
          products={products}
          key={chapter.id}
        />
      );
    case "catalog":
      return (
        <ProductShelfSection
          chapter={chapter}
          config={shelfConfigs["global-products"]}
          products={products}
          key={chapter.id}
        />
      );
    case "agri-mission":
      return <AgriCommunityWorldSection chapter={chapter} config={missionConfigs["agri-drones"]} key={chapter.id} />;
    case "city-mission":
      return <CityDroneWorldSection chapter={chapter} config={missionConfigs["city-drones"]} key={chapter.id} />;
  }
}

export function HomeLandingComposite({
  products,
  productReviews = [],
  footer,
  homepageCms,
  homepageCmsV2,
  relatedArticles = [],
  pressCoverage = []
}: {
  products: Product[];
  productReviews?: ProductPageReview[];
  footer?: FooterContent;
  homepageCms?: HomepageCmsContent;
  homepageCmsV2?: HomepageCmsV2Content;
  relatedArticles?: BlogPost[];
  pressCoverage?: PressCoverageItem[];
}) {
  const strictWithoutCms = isCmsStrictMode() && !homepageCms;
  const cms = homepageCms ?? getHomepageBaseCmsContent();
  const cmsV2 = homepageCmsV2 ?? defaultHomepageCmsV2Content;
  const { shelfConfigs, missionConfigs, chapterById } = resolveHomepageLandingState(cms);
  const miniCarouselItems = resolveHomeMiniCarouselItems(products, cmsV2.miniCarousel);
  const maxReviews = Math.max(1, Math.min(12, cmsV2.reviews.maxCount || HOME_TESTIMONIAL_SHOWCASE_COUNT));
  const testimonialItems = pickHomeTestimonialItemsFromCms(cmsV2.testimonialCards ?? [], products, maxReviews);
  const resolvedFooter = footer ?? (isCmsStrictMode() ? null : footerContent);

  if (strictWithoutCms) {
    return null;
  }

  return (
    <HomeCompositeSection>
      {cmsV2.miniCarousel.enabled !== false ? <HomeMiniCarousel items={miniCarouselItems} /> : null}

      {chapterById["drone-world"]
        ? renderChapter({ chapter: chapterById["drone-world"], products, shelfConfigs, missionConfigs })
        : null}
      <HomeInterShelfBanner banner={cmsV2.banners.interShelf[0]} testId="banner-inter-shelf-1" priority />

      {chapterById["drone-care"]
        ? renderChapter({ chapter: chapterById["drone-care"], products, shelfConfigs, missionConfigs })
        : null}
      <HomeInterShelfBanner banner={cmsV2.banners.interShelf[1]} testId="banner-inter-shelf-2" />

      {chapterById["global-products"]
        ? renderChapter({ chapter: chapterById["global-products"], products, shelfConfigs, missionConfigs })
        : null}
      <HomeInterShelfBanner banner={cmsV2.banners.interShelf[2]} testId="banner-inter-shelf-3" />

      <HomeFullViewportBanner banner={cmsV2.banners.fullViewport[0]} testId="banner-full-viewport-1" />
      <HomeFullViewportBanner banner={cmsV2.banners.fullViewport[1]} testId="banner-full-viewport-2" />

      {chapterById["agri-drones"]
        ? renderChapter({ chapter: chapterById["agri-drones"], products, shelfConfigs, missionConfigs })
        : null}
      {chapterById["city-drones"]
        ? renderChapter({ chapter: chapterById["city-drones"], products, shelfConfigs, missionConfigs })
        : null}

      {cmsV2.reviews.enabled !== false ? (
        <HomeClientTestimonialsSection items={testimonialItems} header={cms.testimonials} />
      ) : null}

      <HomeRelatedArticlesSection
        posts={relatedArticles}
        pressItems={pressCoverage}
        customItems={cmsV2.relatedArticles.enabled !== false ? cmsV2.relatedArticles.items : []}
        selectedItems={
          cmsV2.relatedArticles.enabled !== false ? cmsV2.relatedArticles.selectedItems : undefined
        }
        sectionTitle={cmsV2.relatedArticles.sectionTitle}
        sectionLead={cmsV2.relatedArticles.sectionLead}
        browseAllHref={cmsV2.relatedArticles.browseAllHref}
      />

      <div className={styles.aboutFooterWrap} id="home-about-footer" data-testid="home-about-footer">
        {resolvedFooter ? <SiteFooter content={resolvedFooter} /> : null}
      </div>
    </HomeCompositeSection>
  );
}

function formatMissionHeadline(title: string) {
  return title.trim().replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

type MissionLightPoint = { x: string; y: string };

type MissionLightZones = {
  zone1: MissionLightPoint;
  zone2: MissionLightPoint;
  zone3: MissionLightPoint;
  zone4: MissionLightPoint;
};

type MissionZoneColors = {
  zone1: string;
  zone2: string;
  zone3: string;
  zone4: string;
};

type MissionImagePresentation = {
  objectPosition: string;
  scale: number;
  transformOrigin: string;
  zones: MissionLightZones;
  zoneColors: MissionZoneColors;
};

const defaultAgriZones: MissionLightZones = {
  zone1: { x: "52%", y: "40%" },
  zone2: { x: "22%", y: "62%" },
  zone3: { x: "74%", y: "42%" },
  zone4: { x: "90%", y: "8%" }
};

const defaultAgriZoneColors: MissionZoneColors = {
  zone1: "42, 195, 135",
  zone2: "118, 195, 155",
  zone3: "210, 225, 95",
  zone4: "255, 215, 145"
};

const defaultCityZones: MissionLightZones = {
  zone1: { x: "50%", y: "36%" },
  zone2: { x: "24%", y: "54%" },
  zone3: { x: "72%", y: "22%" },
  zone4: { x: "90%", y: "8%" }
};

const defaultCityZoneColors: MissionZoneColors = {
  zone1: "55, 145, 245",
  zone2: "110, 195, 255",
  zone3: "215, 242, 255",
  zone4: "130, 225, 248"
};

function missionLightZoneStyle(zones: MissionLightZones, zoneColors: MissionZoneColors): CSSProperties {
  return {
    "--zone-1-x": zones.zone1.x,
    "--zone-1-y": zones.zone1.y,
    "--zone-2-x": zones.zone2.x,
    "--zone-2-y": zones.zone2.y,
    "--zone-3-x": zones.zone3.x,
    "--zone-3-y": zones.zone3.y,
    "--zone-4-x": zones.zone4.x,
    "--zone-4-y": zones.zone4.y,
    "--zone-1-color": zoneColors.zone1,
    "--zone-2-color": zoneColors.zone2,
    "--zone-3-color": zoneColors.zone3,
    "--zone-4-color": zoneColors.zone4
  } as CSSProperties;
}

type MissionStoryTheme = {
  id: string;
  scrim: "cream" | "cool" | "warm";
  zoneColors: MissionZoneColors;
};

const MISSION_STORY_THEMES: Record<string, MissionStoryTheme> = {
  "agrone-pilot-registration": {
    id: "pilot",
    scrim: "cream",
    zoneColors: {
      zone1: "118, 220, 196",
      zone2: "72, 188, 220",
      zone3: "186, 242, 232",
      zone4: "148, 214, 204"
    }
  },
  "agrone-drone-owner-registration": {
    id: "owner",
    scrim: "cool",
    zoneColors: {
      zone1: "72, 148, 220",
      zone2: "118, 210, 188",
      zone3: "168, 206, 238",
      zone4: "132, 188, 210"
    }
  },
  "all-india-drone-farmer": {
    id: "booking",
    scrim: "cool",
    zoneColors: {
      zone1: "88, 156, 228",
      zone2: "168, 148, 228",
      zone3: "196, 188, 242",
      zone4: "142, 178, 232"
    }
  },
  "smart-farmer-register": {
    id: "farmer",
    scrim: "cream",
    zoneColors: {
      zone1: "108, 198, 148",
      zone2: "186, 220, 168",
      zone3: "228, 238, 210",
      zone4: "168, 210, 178"
    }
  },
  "agri-drone-loan": {
    id: "finance",
    scrim: "warm",
    zoneColors: {
      zone1: "228, 196, 128",
      zone2: "242, 224, 186",
      zone3: "248, 236, 210",
      zone4: "220, 188, 132"
    }
  },
  "dronelancer-model": {
    id: "network",
    scrim: "cool",
    zoneColors: {
      zone1: "108, 168, 228",
      zone2: "196, 206, 218",
      zone3: "168, 198, 238",
      zone4: "148, 178, 212"
    }
  },
  "city-drone-rental-services-app": {
    id: "rental",
    scrim: "cool",
    zoneColors: {
      zone1: "96, 210, 232",
      zone2: "228, 242, 248",
      zone3: "148, 218, 238",
      zone4: "186, 232, 244"
    }
  },
  "all-drone-acadamic": {
    id: "academy",
    scrim: "cool",
    zoneColors: {
      zone1: "148, 128, 228",
      zone2: "88, 156, 228",
      zone3: "186, 178, 242",
      zone4: "128, 148, 218"
    }
  },
  "drone-franchisecare-center": {
    id: "care",
    scrim: "cream",
    zoneColors: {
      zone1: "108, 198, 210",
      zone2: "228, 242, 246",
      zone3: "148, 210, 220",
      zone4: "186, 224, 232"
    }
  },
  "drone-technician-aggregation": {
    id: "technician",
    scrim: "cool",
    zoneColors: {
      zone1: "196, 206, 218",
      zone2: "88, 156, 220",
      zone3: "168, 188, 212",
      zone4: "148, 178, 228"
    }
  }
};

const FALLBACK_AGRI_STORY: MissionStoryTheme = {
  id: "agri",
  scrim: "cream",
  zoneColors: defaultAgriZoneColors
};

const FALLBACK_CITY_STORY: MissionStoryTheme = {
  id: "city",
  scrim: "cool",
  zoneColors: defaultCityZoneColors
};

function missionImageKeyFromSrc(src: string) {
  return src.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? "";
}

function getMissionStoryTheme(src: string, variant: "agri" | "city") {
  const key = missionImageKeyFromSrc(src);
  return MISSION_STORY_THEMES[key] ?? (variant === "city" ? FALLBACK_CITY_STORY : FALLBACK_AGRI_STORY);
}

function missionCardStyle({
  imagePresentation,
  storyTheme,
  variant
}: {
  imagePresentation: MissionImagePresentation;
  storyTheme: MissionStoryTheme;
  variant: "agri" | "city";
}): CSSProperties {
  const scaleVar =
    variant === "city"
      ? ({ ["--city-image-scale"]: String(imagePresentation.scale) } as CSSProperties)
      : ({ ["--agri-image-scale"]: String(imagePresentation.scale) } as CSSProperties);

  return {
    "--agri-object-position": imagePresentation.objectPosition,
    ...scaleVar,
    ...missionLightZoneStyle(imagePresentation.zones, storyTheme.zoneColors)
  } as CSSProperties;
}

const agriImagePresentation: Record<string, MissionImagePresentation> = {
  "agrone-drone-owner-registration": {
    objectPosition: "50% 42%",
    scale: 1.02,
    transformOrigin: "center center",
    zones: {
      zone1: { x: "50%", y: "38%" },
      zone2: { x: "22%", y: "58%" },
      zone3: { x: "76%", y: "46%" },
      zone4: { x: "90%", y: "8%" }
    },
    zoneColors: {
      zone1: "38, 188, 128",
      zone2: "108, 188, 148",
      zone3: "205, 220, 88",
      zone4: "255, 210, 138"
    }
  },
  "agrone-pilot-registration": {
    objectPosition: "54% 40%",
    scale: 1.03,
    transformOrigin: "center center",
    zones: {
      zone1: { x: "58%", y: "42%" },
      zone2: { x: "32%", y: "55%" },
      zone3: { x: "72%", y: "22%" },
      zone4: { x: "92%", y: "6%" }
    },
    zoneColors: {
      zone1: "32, 178, 118",
      zone2: "98, 188, 158",
      zone3: "195, 228, 88",
      zone4: "255, 205, 128"
    }
  },
  "all-india-drone-farmer": {
    objectPosition: "52% 44%",
    scale: 1.02,
    transformOrigin: "center center",
    zones: {
      zone1: { x: "56%", y: "40%" },
      zone2: { x: "16%", y: "64%" },
      zone3: { x: "76%", y: "52%" },
      zone4: { x: "88%", y: "10%" }
    },
    zoneColors: {
      zone1: "48, 195, 108",
      zone2: "128, 198, 138",
      zone3: "235, 205, 88",
      zone4: "255, 215, 148"
    }
  },
  "smart-farmer-register": {
    objectPosition: "50% 42%",
    scale: 1.0,
    transformOrigin: "center center",
    zones: {
      zone1: { x: "50%", y: "42%" },
      zone2: { x: "24%", y: "62%" },
      zone3: { x: "72%", y: "32%" },
      zone4: { x: "92%", y: "10%" }
    },
    zoneColors: {
      zone1: "58, 185, 98",
      zone2: "138, 205, 128",
      zone3: "225, 210, 78",
      zone4: "255, 212, 132"
    }
  },
  "agri-drone-loan": {
    objectPosition: "48% 40%",
    scale: 1.0,
    transformOrigin: "center center",
    zones: {
      zone1: { x: "42%", y: "38%" },
      zone2: { x: "68%", y: "50%" },
      zone3: { x: "55%", y: "28%" },
      zone4: { x: "90%", y: "10%" }
    },
    zoneColors: {
      zone1: "38, 175, 128",
      zone2: "98, 175, 205",
      zone3: "148, 215, 148",
      zone4: "255, 208, 128"
    }
  }
};

function agriImageKeyFromSrc(src: string) {
  return src.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? "";
}

function getAgriImagePresentation(src: string, cardType: "tall" | "hero" | "standard" | "wide") {
  const key = agriImageKeyFromSrc(src);
  const tuned = agriImagePresentation[key];
  if (tuned) return tuned;

  const fallbackScale =
    cardType === "standard" ? 1.02 : cardType === "hero" ? 1.04 : cardType === "wide" ? 1.03 : 1.03;
  return {
    objectPosition: "50% 40%",
    scale: fallbackScale,
    transformOrigin: "center center",
    zones: defaultAgriZones,
    zoneColors: defaultAgriZoneColors
  };
}

function MissionWorldCardContent({
  tile,
  cardType,
  imagePresentation,
  sizes,
  variant,
  logoCover
}: {
  tile: MissionWorldTile;
  cardType: "tall" | "hero" | "standard" | "wide";
  imagePresentation: MissionImagePresentation;
  sizes: string;
  variant: "agri" | "city";
  logoCover?: boolean;
}) {
  const isCity = variant === "city";
  const imageFrameClass = isCity ? styles.cityCardImageFrame : styles.agriCardImageFrame;
  const textProtectionClass = isCity ? styles.cityCardTextProtection : styles.agriCardTextProtection;

  return (
    <>
      <div className={styles.missionCardImageStage}>
        <MithronMissionTileImage
          src={tile.media.src}
          alt={tile.media.alt || tile.label}
          cardType={cardType}
          wrapperClassName={imageFrameClass}
          sizes={sizes}
          className={styles.agriCardImage}
          style={{
            objectPosition: imagePresentation.objectPosition,
            transformOrigin: imagePresentation.transformOrigin
          }}
        />
        {logoCover ? <span className={styles.missionCardBrandShield} aria-hidden="true" /> : null}
      </div>
      {isCity ? (
        <span className={styles.missionCardExternalIndicator} aria-hidden="true">
          <ArrowUpRight size={16} />
        </span>
      ) : null}
      <span
        className={`${styles.agriCardAmbient} ${cardType === "hero" ? styles.agriCardAmbientDominant : ""}`}
        aria-hidden="true"
      >
        <span className={`${styles.agriCardAmbientLayer} ${styles.agriCardAmbientBeam}`} />
        <span className={`${styles.agriCardAmbientLayer} ${styles.agriCardAmbientWash}`} />
        <span className={`${styles.agriCardAmbientLayer} ${styles.agriCardAmbientAccent}`} />
      </span>
      <div className={styles.missionCardFloat}>
        <div className={styles.missionCardCopyRow}>
          <span className={styles.agriCardCopy}>
            <span className={textProtectionClass} aria-hidden="true" />
            <strong>{tile.label}</strong>
            <EditorRenderedContent html={tile.body} className={styles.missionTileBody} />
          </span>
          <span className={styles.agriCardArrow} aria-hidden="true">
            <ArrowRight size={16} />
          </span>
        </div>
      </div>
    </>
  );
}

function renderMissionWorldTile(
  tile: MissionWorldTile,
  tileKey: string,
  tileProps: Record<string, unknown>,
  tileContent: ReactNode
) {
  const href = tile.href?.trim();
  if (!href) {
    return (
      <div
        key={tileKey}
        {...tileProps}
        className={`${String(tileProps.className ?? "")} ${styles.agriCardShowcase}`}
        data-showcase-link="false"
      >
        {tileContent}
      </div>
    );
  }

  const isExternal = /^https?:\/\//i.test(href);
  return (
    <Link
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      aria-label={`${tile.label}. ${editorHtmlToPlainText(tile.body)}${isExternal ? " Opens in a new tab." : ""}`}
      key={tileKey}
      {...tileProps}
    >
      {tileContent}
    </Link>
  );
}

function missionWorldImageSizes(cardType: "tall" | "hero" | "standard" | "wide") {
  switch (cardType) {
    case "hero":
      return "(max-width: 640px) 100vw, (max-width: 980px) 100vw, 65vw";
    case "wide":
      return "(max-width: 640px) 100vw, (max-width: 980px) 100vw, 68vw";
    case "tall":
      return "(max-width: 640px) 100vw, (max-width: 980px) 48vw, 35vw";
    default:
      return "(max-width: 640px) 100vw, (max-width: 980px) 48vw, 21vw";
  }
}

function MissionWorldBentoSection({
  chapter,
  config,
  variant,
  sectionClassName,
  testId,
  headline,
  introFooter
}: {
  chapter: HomeChapter;
  config: MissionWorldConfig;
  variant: "agri" | "city";
  sectionClassName: string;
  testId: string;
  headline: string;
  introFooter?: ReactNode;
}) {
  const renderMissionCard = (
    tile: MissionWorldTile,
    cardType: "tall" | "hero" | "standard" | "wide"
  ) => {
    const resolvedTile = tile;
    const imagePresentation =
      variant === "city"
        ? getCityImagePresentation(resolvedTile.media.src, cardType)
        : getAgriImagePresentation(resolvedTile.media.src, cardType);
    const imageKey =
      variant === "city"
        ? cityImageKeyFromSrc(resolvedTile.media.src)
        : agriImageKeyFromSrc(resolvedTile.media.src);
    const storyTheme = getMissionStoryTheme(resolvedTile.media.src, variant);
    const tileClassName = `${styles.agriCard} ${styles[`agriCard_${cardType}`]}`;
    const tileProps = {
      className: tileClassName,
      "data-testid": "mission-world-tile",
      "data-showcase-kind": "mission-image",
      "data-tile-size": cardType,
      ...(variant === "agri" ? { "data-agri-image": imageKey || undefined } : {}),
      ...(variant === "city" ? { "data-city-image": imageKey || undefined } : {}),
      ...(variant === "city" ? { "data-external-destination": "zroneo-app" as const } : {}),
      "data-mission-story": storyTheme.id,
      "data-scrim": storyTheme.scrim,
      "data-dominant": cardType === "hero" ? "true" : "false",
      ...(variant === "city" && imageKey === "city-drone-rental-services-app"
        ? { "data-logo-cover": "true" as const }
        : {}),
      style: missionCardStyle({ imagePresentation, storyTheme, variant })
    };

    const tileContent = (
      <MissionWorldCardContent
        tile={resolvedTile}
        cardType={cardType}
        imagePresentation={imagePresentation}
        variant={variant}
        logoCover={variant === "city" && imageKey === "city-drone-rental-services-app"}
        sizes={missionWorldImageSizes(cardType)}
      />
    );

    return renderMissionWorldTile(resolvedTile, `${variant}-${resolvedTile.label}`, tileProps, tileContent);
  };

  return (
    <article
      id={chapter.id}
      className={`${styles.agriSection} ${sectionClassName}`.trim()}
      data-home-composite-chapter={chapter.id}
      data-layout-kind={chapter.layoutKind}
      data-mission-motion="skip"
      data-testid={testId}
    >
      <div className={styles.agriContainer} data-home-content-shell="true">
        <div className={styles.missionWorldShowcaseStage}>
          <span className={styles.missionWorldShowcaseAtmosphere} aria-hidden="true" />
          <div className={styles.missionWorldBento}>
            <div className={styles.missionWorldLeftRail}>
              <div className={styles.missionWorldTextHeader}>
                <h2 className={styles.agriHeadline}>{headline}</h2>
                <div className={styles.agriIntroBody}>
                  <EditorRenderedContent html={config.body} className={styles.agriIntroPlainText} />
                  {introFooter}
                </div>
              </div>
              <div className={styles.missionWorldSlotTall}>{renderMissionCard(config.tiles[0], "tall")}</div>
            </div>
            <div className={styles.missionWorldRightRail}>
              <div className={styles.missionWorldSlotHero}>{renderMissionCard(config.tiles[1], "hero")}</div>
              <div className={styles.missionWorldSupportGrid}>
                {renderMissionCard(config.tiles[3], "standard")}
                {renderMissionCard(config.tiles[4], "standard")}
                {renderMissionCard(config.tiles[2], "standard")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function AgriCommunityWorldSection({
  chapter,
  config
}: {
  chapter: HomeChapter;
  config: MissionWorldConfig;
}) {
  return (
    <MissionWorldBentoSection
      chapter={chapter}
      config={config}
      variant="agri"
      sectionClassName=""
      testId="agri-community-world-section"
      headline={formatMissionHeadline(config.title)}
    />
  );
}

const cityImagePresentation: Record<string, MissionImagePresentation> = {
  "dronelancer-model": {
    objectPosition: "48% 40%",
    scale: 1.02,
    transformOrigin: "center center",
    zones: {
      zone1: { x: "52%", y: "34%" },
      zone2: { x: "24%", y: "56%" },
      zone3: { x: "70%", y: "20%" },
      zone4: { x: "90%", y: "8%" }
    },
    zoneColors: {
      zone1: "48, 138, 238",
      zone2: "98, 188, 255",
      zone3: "220, 245, 255",
      zone4: "118, 225, 248"
    }
  },
  "city-drone-rental-services-app": {
    objectPosition: "46% 40%",
    scale: 1.0,
    transformOrigin: "center center",
    zones: {
      zone1: { x: "48%", y: "40%" },
      zone2: { x: "22%", y: "56%" },
      zone3: { x: "72%", y: "24%" },
      zone4: { x: "92%", y: "10%" }
    },
    zoneColors: {
      zone1: "42, 148, 235",
      zone2: "108, 198, 255",
      zone3: "235, 250, 255",
      zone4: "125, 228, 248"
    }
  },
  "all-drone-acadamic": {
    objectPosition: "50% 40%",
    scale: 1.02,
    transformOrigin: "center center",
    zones: {
      zone1: { x: "50%", y: "36%" },
      zone2: { x: "28%", y: "58%" },
      zone3: { x: "74%", y: "22%" },
      zone4: { x: "90%", y: "8%" }
    },
    zoneColors: {
      zone1: "58, 128, 235",
      zone2: "118, 168, 255",
      zone3: "215, 240, 255",
      zone4: "128, 225, 248"
    }
  },
  "drone-franchisecare-center": {
    objectPosition: "50% 38%",
    scale: 1.0,
    transformOrigin: "center center",
    zones: {
      zone1: { x: "52%", y: "38%" },
      zone2: { x: "24%", y: "60%" },
      zone3: { x: "70%", y: "26%" },
      zone4: { x: "92%", y: "8%" }
    },
    zoneColors: {
      zone1: "68, 128, 215",
      zone2: "128, 168, 245",
      zone3: "230, 248, 255",
      zone4: "138, 228, 252"
    }
  },
  "drone-technician-aggregation": {
    objectPosition: "50% 42%",
    scale: 1.0,
    transformOrigin: "center center",
    zones: {
      zone1: { x: "50%", y: "38%" },
      zone2: { x: "22%", y: "58%" },
      zone3: { x: "72%", y: "24%" },
      zone4: { x: "90%", y: "8%" }
    },
    zoneColors: {
      zone1: "52, 148, 215",
      zone2: "108, 188, 255",
      zone3: "225, 248, 255",
      zone4: "125, 228, 248"
    }
  }
};

function cityImageKeyFromSrc(src: string) {
  return src.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? "";
}

function getCityImagePresentation(src: string, cardType: "tall" | "hero" | "standard" | "wide") {
  const key = cityImageKeyFromSrc(src);
  const tuned = cityImagePresentation[key];
  if (tuned) return tuned;

  const fallbackScale =
    cardType === "standard" ? 1.02 : cardType === "hero" ? 1.04 : cardType === "wide" ? 1.03 : 1.03;
  return {
    objectPosition: "50% 42%",
    scale: fallbackScale,
    transformOrigin: "center center",
    zones: defaultCityZones,
    zoneColors: defaultCityZoneColors
  };
}

export function CityDroneWorldSection({
  chapter,
  config
}: {
  chapter: HomeChapter;
  config: MissionWorldConfig;
}) {
  return (
    <MissionWorldBentoSection
      chapter={chapter}
      config={config}
      variant="city"
      sectionClassName={styles.citySection}
      testId="city-drone-world-section"
      headline={formatMissionHeadline(config.title)}
      introFooter={
        config.mediaNote ? (
          <p className={styles.agriFallbackNote}>
            {config.mediaState}: {config.mediaNote}
          </p>
        ) : null
      }
    />
  );
}
