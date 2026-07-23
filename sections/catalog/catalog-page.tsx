import Link from "next/link";
import dynamic from "next/dynamic";
import { Suspense, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { StorefrontRevealImage } from "@/components/media/storefront-reveal-image";
import { MithronPageHeroImage } from "@/components/media/mithron-page-hero-image";
import type { Product } from "@/config/types";
import { getResponsiveAssetForSrc } from "@/config/generated-assets";
import { getCatalogShowcaseMedia } from "@/lib/catalog-showcase-media";
import { resolveNavbarInkFromShowcase } from "@/lib/navbar-ink-sampling";
import { catalogCinematicBannerFrame } from "@/config/catalog-routes";
import type { CatalogProductGroup } from "@/lib/catalog-product-listing";
import { slimCatalogListingProducts } from "@/lib/catalog-product-listing";
import { cn } from "@/lib/utils";
import styles from "./catalog-page.module.css";

function CatalogListingSkeleton() {
  return (
    <div className="min-h-[40vh]" aria-hidden="true" data-catalog-listing-skeleton>
      <div className="mb-6 h-10 max-w-md animate-pulse rounded-md bg-[#eef0f3]" />
      <div className="catalog-product-grid min-w-0 grid gap-[var(--mobile-grid-gap,10px)] grid-cols-2 md:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="animate-pulse overflow-hidden rounded-2xl bg-[#eef0f3]">
            <div className="aspect-[4/5] w-full bg-[#e4e7eb]" />
            <div className="space-y-2 p-3">
              <div className="h-3 w-2/3 rounded bg-[#dde1e6]" />
              <div className="h-3 w-1/2 rounded bg-[#dde1e6]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const CatalogFilteredListing = dynamic(
  () =>
    import("@/sections/catalog/catalog-filtered-listing").then((mod) => mod.CatalogFilteredListing),
  {
    ssr: true,
    loading: () => <CatalogListingSkeleton />
  }
);

type CatalogShowcaseImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
  navbarInk?: "light" | "dark";
  fit?: "cinematic" | "native";
  mobileAspectRatio?: string;
  mobileObjectPosition?: string;
};

export function CatalogPage({
  title,
  subtitle,
  products,
  heroImage,
  showcaseImage,
  presentation = "standard",
  listingMode = "category",
  initialGroup = "all",
  initialQuery = "",
  showBack = false
}: {
  title?: string;
  subtitle?: string;
  products: Product[];
  heroImage?: string;
  showcaseImage?: CatalogShowcaseImage;
  presentation?: "standard" | "showroom";
  listingMode?: "category" | "global";
  initialGroup?: CatalogProductGroup;
  initialQuery?: string;
  showBack?: boolean;
}) {
  const listingProducts = slimCatalogListingProducts(products);
  const isShowroom = presentation === "showroom";
  const optimizedShowcase = showcaseImage ? getCatalogShowcaseMedia(showcaseImage.src) : null;
  const showcaseAsset = showcaseImage ? getResponsiveAssetForSrc(showcaseImage.src) : null;
  const catalogNavbarInk = showcaseImage
    ? resolveNavbarInkFromShowcase(showcaseImage, showcaseAsset?.dominantColor)
    : null;
  const heroProduct = listingProducts[0];
  const heroMetrics = listingProducts.slice(0, 3);
  const catalogTitle = title ?? heroProduct?.category ?? "Mithron products";
  const catalogSubtitle = subtitle ?? (heroProduct ? `Browse ${heroProduct.category.toLowerCase()} selected for professional use.` : "Browse drones, accessories, and work-ready products from Mithron.");
  const shouldRenderFallbackHero = !showcaseImage && title && subtitle && heroImage;
  const shouldRenderTextHero = !showcaseImage && !shouldRenderFallbackHero && Boolean(title || subtitle);
  const showcaseFit = showcaseImage?.fit ?? "cinematic";
  const showcaseFrame =
    showcaseFit === "cinematic"
      ? catalogCinematicBannerFrame
      : showcaseImage
        ? {
            width: showcaseImage.width,
            height: showcaseImage.height,
            mobileAspectRatio: showcaseImage.mobileAspectRatio ?? "1.55 / 1",
            mobileObjectPosition: showcaseImage.mobileObjectPosition ?? "center center"
          }
        : null;

  return (
    <div className={cn(isShowroom ? styles.shell : "surface-page", "catalog-page-shell")}>
      {showcaseImage ? (
        <section
          className="catalog-hero-section catalog-hero-section--showcase"
          data-navbar-ink={catalogNavbarInk ?? "light"}
          data-navbar-tone={catalogNavbarInk === "dark" ? "light" : "dark"}
          data-hero-dominant-color={showcaseAsset?.dominantColor}
          data-navbar-ink-surface=""
          data-showcase-fit={showcaseFit}
          style={
            showcaseFrame
              ? ({
                  "--showcase-aspect-ratio": `${showcaseFrame.width} / ${showcaseFrame.height}`,
                  "--showcase-max-width": `${showcaseFrame.width}px`,
                  "--showcase-mobile-aspect-ratio": showcaseFrame.mobileAspectRatio,
                  "--showcase-mobile-object-position": showcaseFrame.mobileObjectPosition
                } as CSSProperties)
              : undefined
          }
          aria-label={showcaseImage.alt}
        >
          <div className="catalog-hero-top-spacer" aria-hidden="true" />
          <div className="catalog-hero-immersive" data-testid="catalog-mobile-hero">
            <div className="catalog-hero-immersive__media">
              <picture className="catalog-hero-image-section__frame">
                {optimizedShowcase?.avifSrcSet ? <source type="image/avif" srcSet={optimizedShowcase.avifSrcSet} sizes="(min-width: 1440px) 1440px, 100vw" /> : null}
                {optimizedShowcase?.webpSrcSet ? <source type="image/webp" srcSet={optimizedShowcase.webpSrcSet} sizes="(min-width: 1440px) 1440px, 100vw" /> : null}
                <StorefrontRevealImage
                  src={optimizedShowcase?.src ?? showcaseImage.src}
                  alt={showcaseImage.alt}
                  width={optimizedShowcase?.width ?? showcaseImage.width}
                  height={optimizedShowcase?.height ?? showcaseImage.height}
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                  crossOrigin="anonymous"
                  sizes="(min-width: 1440px) 1440px, 100vw"
                  className="catalog-hero-image-section__asset"
                />
              </picture>
            </div>
          </div>
        </section>
      ) : shouldRenderFallbackHero ? (
        <section className="catalog-hero-section ambient-section ambient-dark relative overflow-hidden bg-black page-gutter pb-12 pt-12 text-white md:pb-16 md:pt-16 max-lg:min-h-[clamp(280px,50dvh,560px)] lg:min-h-[560px]" data-navbar-ink="light" data-surface="dark">
          <MithronPageHeroImage src={heroImage} alt={title} fill className="catalog-hero__bg object-cover opacity-28 blur-[1px] saturate-[.86]" sizes="(min-width: 1440px) 1440px, 100vw" />
          <div className="catalog-hero__shade absolute inset-0" />
          <div className="catalog-hero__floor absolute inset-x-0 bottom-0 h-32" />
          <div className="catalog-hero__layout relative z-10 mx-auto grid max-w-[min(100%,var(--ds-container-catalog))] items-center gap-10 md:grid-cols-[minmax(0,.9fr)]">
            <div className="catalog-hero__copy">
              <p className="catalog-hero__eyebrow type-meta text-white/72">Drones & accessories</p>
              <h1 className="catalog-hero__title type-page mt-5 max-w-3xl">{title}</h1>
              <p className="catalog-hero__subtitle type-subtitle mt-6 max-w-2xl text-white/85">{subtitle}</p>
              <div className="catalog-hero__actions mt-8 flex flex-wrap gap-3">
                {heroProduct ? (
                  <Button asChild variant="accent">
                    <Link href={`/product/${heroProduct.slug}`}>View product</Link>
                  </Button>
                ) : null}
                <Button asChild variant="glass">
                  <Link href="#catalog-grid">Shop all products</Link>
                </Button>
              </div>
              {heroMetrics.length ? (
                <div className="catalog-hero__tags mt-8 flex flex-wrap gap-3">
                  {heroMetrics.map((product) => (
                    <Link key={product.slug} href={`/product/${product.slug}`} className="catalog-hero__tag type-button rounded-full border border-white/12 bg-[#080b0f]/28 px-4 py-2 text-xs text-white/72 transition-colors hover:bg-[#080b0f]/38 hover:text-white">
                      {product.category}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : shouldRenderTextHero ? (
        <section
          className="catalog-hero-section catalog-hero-section--text page-gutter pb-5 pt-10 md:pb-6 md:pt-12"
          data-navbar-ink="dark"
          data-navbar-ink-surface=""
          aria-label={catalogTitle}
        >
          <div className="mx-auto max-w-[min(100%,var(--ds-container-catalog))]">
            <p className="type-meta text-[var(--ds-ink-2,#64748b)]">Drones & accessories</p>
            <h1 className="type-page mt-4 max-w-3xl text-[var(--ds-ink,#0f172a)]">{catalogTitle}</h1>
            {catalogSubtitle ? (
              <p className="type-subtitle mt-4 max-w-2xl text-[var(--ds-ink-2,#475569)]">{catalogSubtitle}</p>
            ) : null}
          </div>
        </section>
      ) : null}
      <section
        id="catalog-grid"
        className={isShowroom ? styles.gridSection : "catalog-grid-section mx-auto max-w-[min(100%,var(--ds-container-catalog))] scroll-mt-28 page-gutter"}
        data-navbar-ink="dark"
      >
        <Suspense fallback={<CatalogListingSkeleton />}>
          <CatalogFilteredListing
            products={listingProducts}
            mode={listingMode}
            presentation={presentation}
            title={catalogTitle}
            suppressListingTitle={Boolean(shouldRenderFallbackHero || shouldRenderTextHero)}
            initialGroup={listingMode === "global" ? initialGroup : "all"}
            initialQuery={initialQuery}
            showBack={showBack}
          />
        </Suspense>
      </section>
    </div>
  );
}
